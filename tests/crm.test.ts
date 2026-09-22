import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/db";
import { users, dealerships, memberships } from "../src/server/schema";
import type { TenantContext } from "../src/server/auth";
import { saveVehicle } from "../src/services/vehicles";
import {
  saveCustomer,
  getCustomer,
  listCustomers,
  customerHistory,
} from "../src/services/customers";
import {
  createLead,
  getLead,
  board,
  changeStage,
  assignLead,
  addActivity,
  leadsForVehicle,
  countOpenLeadsByVehicle,
  crmSummary,
} from "../src/services/leads";
import { normalizePhone, whatsappLink, canReadLead } from "../src/domain/crm";
import { customerSchema } from "../src/domain/validation";

let directory: string;

const vehicle = {
  brand: "Marca teste",
  model: "Modelo teste",
  version: "",
  yearManufacture: 2022,
  yearModel: 2023,
  mileage: 24000,
  transmission: "Automático",
  fuel: "Flex",
  color: "Prata",
  price: 85000,
  plate: "",
  description: "",
  options: [],
  status: "AVAILABLE",
};

async function fixture(role: "ADMIN" | "MANAGER" | "SALESPERSON" = "ADMIN") {
  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: "Usuário teste",
      email: randomUUID() + "@example.test",
      passwordHash: "unused",
    })
    .returning();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      id: randomUUID(),
      tradeName: "Revenda teste",
      slug: randomUUID(),
      cnpj: randomUUID(),
      phone: "11999999999",
      city: "São Paulo",
      state: "SP",
      trialEndsAt: new Date(Date.now() + 86400000),
    })
    .returning();
  const [membership] = await db
    .insert(memberships)
    .values({
      id: randomUUID(),
      userId: user.id,
      dealershipId: dealership.id,
      role,
    })
    .returning();
  return { user, dealership, membership } satisfies TenantContext;
}

// Another member of the SAME dealership, so tenant scope stays constant.
async function colleague(
  ctx: TenantContext,
  role: "MANAGER" | "SALESPERSON",
): Promise<TenantContext> {
  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: "Colega",
      email: randomUUID() + "@example.test",
      passwordHash: "unused",
    })
    .returning();
  const [membership] = await db
    .insert(memberships)
    .values({
      id: randomUUID(),
      userId: user.id,
      dealershipId: ctx.dealership.id,
      role,
    })
    .returning();
  return { user, dealership: ctx.dealership, membership };
}

const customer = {
  name: "Cliente teste",
  phone: "(11) 98888-7777",
  whatsapp: "",
  email: "",
  notes: "",
};

test("CRM: isolamento por revenda em clientes e oportunidades", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "autoweb-crm-"));
  process.env.LOCAL_DATA_DIR = directory;
  const a = await fixture();
  const b = await fixture();

  const customerId = await saveCustomer(a, customer);
  assert.equal((await getCustomer(a, customerId)).name, "Cliente teste");
  // Phone is stored as digits so search and dedupe agree.
  assert.equal((await getCustomer(a, customerId)).phone, "11988887777");

  // The other dealership sees nothing and cannot reach the record.
  assert.equal((await listCustomers(b)).total, 0);
  await assert.rejects(getCustomer(b, customerId), /não encontrado/);
  await assert.rejects(saveCustomer(b, customer, customerId), /não encontrado/);

  const leadId = await createLead(a, {
    customerId,
    vehicleId: "",
    assignedToUserId: "",
    source: "WHATSAPP",
    stage: "NEW",
    notes: "",
    nextActionAt: null,
  });
  await assert.rejects(getLead(b, leadId), /não encontrada/);
  assert.equal(
    (await board(b)).reduce((sum, column) => sum + column.total, 0),
    0,
  );

  // A lead cannot borrow a customer from another dealership.
  const foreignCustomer = await saveCustomer(b, customer);
  await assert.rejects(
    createLead(a, {
      customerId: foreignCustomer,
      vehicleId: "",
      assignedToUserId: "",
      source: "OTHER",
      stage: "NEW",
      notes: "",
      nextActionAt: null,
    }),
    /não encontrado/,
  );
});

test("CRM: vendedor enxerga apenas as oportunidades atribuídas a ele", async () => {
  const admin = await fixture();
  const seller = await colleague(admin, "SALESPERSON");
  const other = await colleague(admin, "SALESPERSON");
  const customerId = await saveCustomer(admin, customer);

  const mine = await createLead(admin, {
    customerId,
    vehicleId: "",
    assignedToUserId: seller.user.id,
    source: "PHONE",
    stage: "NEW",
    notes: "",
    nextActionAt: null,
  });
  const theirs = await createLead(admin, {
    customerId,
    vehicleId: "",
    assignedToUserId: other.user.id,
    source: "PHONE",
    stage: "NEW",
    notes: "",
    nextActionAt: null,
  });

  assert.equal((await getLead(seller, mine)).lead.id, mine);
  await assert.rejects(getLead(seller, theirs), /não encontrada/);

  const columns = await board(seller);
  assert.equal(
    columns.reduce((sum, column) => sum + column.total, 0),
    1,
  );

  // A salesperson cannot move a lead onto a colleague.
  await assert.rejects(
    assignLead(seller, mine, other.user.id),
    /só pode atribuir/,
  );
  // Admin and manager see the whole pipeline.
  assert.equal(
    (await board(admin)).reduce((sum, column) => sum + column.total, 0),
    2,
  );
  const manager = await colleague(admin, "MANAGER");
  assert.equal(
    (await board(manager)).reduce((sum, column) => sum + column.total, 0),
    2,
  );
});

test("CRM: etapas, motivo da perda e histórico", async () => {
  const ctx = await fixture();
  const customerId = await saveCustomer(ctx, customer);
  const leadId = await createLead(ctx, {
    customerId,
    vehicleId: "",
    assignedToUserId: "",
    source: "WEBSITE",
    stage: "NEW",
    notes: "",
    nextActionAt: null,
  });

  await changeStage(ctx, leadId, { stage: "QUALIFIED", lostReason: "" });
  assert.equal((await getLead(ctx, leadId)).lead.stage, "QUALIFIED");

  // Losing a deal requires saying why.
  await assert.rejects(
    changeStage(ctx, leadId, { stage: "LOST", lostReason: "" }),
    /motivo da perda/,
  );
  await changeStage(ctx, leadId, {
    stage: "LOST",
    lostReason: "Comprou em outra loja",
  });
  const lost = await getLead(ctx, leadId);
  assert.equal(lost.lead.stage, "LOST");
  assert.equal(lost.lead.lostReason, "Comprou em outra loja");

  await addActivity(ctx, leadId, {
    type: "CALL",
    content: "Retornei a ligação",
  });
  const detail = await getLead(ctx, leadId);
  // Creation, two stage changes and the call.
  assert.equal(detail.activities.length, 4);
  assert.ok(detail.lead.lastContactAt);

  const history = await customerHistory(ctx, customerId);
  assert.equal(history.open.length, 0);
  assert.equal(history.closed.length, 1);
});

test("CRM: oportunidade ligada a veículo e contagem para o dashboard", async () => {
  const ctx = await fixture();
  const vehicleId = (await saveVehicle(ctx, vehicle))!;
  const customerId = await saveCustomer(ctx, customer);
  const leadId = await createLead(ctx, {
    customerId,
    vehicleId,
    assignedToUserId: "",
    source: "INSTAGRAM",
    stage: "NEW",
    notes: "",
    nextActionAt: null,
  });

  const related = await leadsForVehicle(ctx, vehicleId);
  assert.equal(related.length, 1);
  assert.equal(related[0].lead.id, leadId);
  assert.equal(related[0].customerName, "Cliente teste");

  const counts = await countOpenLeadsByVehicle(ctx, [vehicleId]);
  assert.equal(counts.get(vehicleId), 1);

  const summary = await crmSummary(ctx, new Date(Date.now() - 86400000));
  assert.equal(summary.newLeads, 1);
  assert.equal(summary.openLeads, 1);
  assert.equal(summary.recent[0].lead.id, leadId);

  // Won leads leave the open count.
  await changeStage(ctx, leadId, { stage: "WON", lostReason: "" });
  assert.equal(
    (await countOpenLeadsByVehicle(ctx, [vehicleId])).get(vehicleId),
    undefined,
  );
  assert.equal((await crmSummary(ctx, new Date(0))).openLeads, 0);

  // A vehicle from another dealership cannot be attached.
  const outsider = await fixture();
  const foreignVehicle = (await saveVehicle(outsider, vehicle))!;
  await assert.rejects(
    createLead(ctx, {
      customerId,
      vehicleId: foreignVehicle,
      assignedToUserId: "",
      source: "OTHER",
      stage: "NEW",
      notes: "",
      nextActionAt: null,
    }),
    /não encontrado/,
  );
});

test("CRM: regras de domínio para contato e visibilidade", () => {
  assert.equal(normalizePhone("(11) 98888-7777"), "11988887777");
  assert.equal(normalizePhone("+55 11 98888-7777"), "11988887777");
  assert.equal(normalizePhone("1132221111"), "1132221111");
  assert.equal(normalizePhone("123"), "");
  assert.equal(
    whatsappLink("11988887777", "Olá"),
    "https://wa.me/5511988887777?text=Ol%C3%A1",
  );
  assert.equal(whatsappLink(""), "");

  // A customer nobody can reach is rejected.
  assert.throws(() =>
    customerSchema.parse({ name: "Sem contato", phone: "", whatsapp: "" }),
  );
  assert.ok(
    customerSchema.parse({ name: "Com telefone", phone: "11988887777" }),
  );

  assert.equal(canReadLead("ADMIN", "u1", { assignedToUserId: "u2" }), true);
  assert.equal(canReadLead("MANAGER", "u1", { assignedToUserId: "u2" }), true);
  assert.equal(
    canReadLead("SALESPERSON", "u1", { assignedToUserId: "u2" }),
    false,
  );
  assert.equal(
    canReadLead("SALESPERSON", "u1", { assignedToUserId: "u1" }),
    true,
  );
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
