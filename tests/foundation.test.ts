import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { users, dealerships, memberships, usage } from "../src/server/schema";
import {
  saveVehicle,
  getVehicle,
  listVehicles,
} from "../src/services/vehicles";
import {
  hashPassword,
  checkPassword,
  type TenantContext,
} from "../src/server/auth";
import { can } from "../src/domain/policies";
import {
  hasFeature,
  getLimit,
  canWrite,
  usagePeriod,
} from "../src/domain/plans";
import { dealershipSchema, vehicleSchema } from "../src/domain/validation";
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
  plate: "ABC1D23",
  description: "",
  options: [],
  status: "AVAILABLE",
};
async function fixture() {
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
      role: "ADMIN",
    })
    .returning();
  return { user, dealership, membership } satisfies TenantContext;
}
test("fundação: isolamento, permissões e limite atômico", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "autoweb-tests-"));
  process.env.LOCAL_DATA_DIR = directory;
  const a = await fixture();
  const b = await fixture();
  const id = await saveVehicle(a, vehicle);
  assert.equal((await getVehicle(a, id!)).price, 8500000);
  assert.equal((await listVehicles(b)).total, 0);
  await assert.rejects(getVehicle(b, id!), /não encontrado/);
  await assert.rejects(saveVehicle(b, vehicle, id!), /não encontrado/);
  const seller = {
    ...a,
    membership: { ...a.membership, role: "SALESPERSON" as const },
  };
  await assert.rejects(saveVehicle(seller, vehicle), /permissão/);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => saveVehicle(a, vehicle)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
  assert.equal((await listVehicles(a)).total, 5);
  await saveVehicle(a, { ...vehicle, price: 90000, status: "SOLD" }, id);
  const [record] = await (
    await getDb()
  )
    .select()
    .from(usage)
    .where(eq(usage.dealershipId, a.dealership.id));
  assert.equal(record.vehicleCount, 5);
  assert.ok((await getVehicle(a, id!)).soldAt);
  await (
    await getDb()
  )
    .update(dealerships)
    .set({ trialEndsAt: new Date(Date.now() - 1000) })
    .where(eq(dealerships.id, a.dealership.id));
  await assert.rejects(saveVehicle(a, vehicle, id), /teste terminou/);
  assert.equal((await getVehicle(a, id!)).price, 9000000);
});
test("senhas usam salt e verificação resistente a comparação direta", async () => {
  const hash = await hashPassword("Senha-de-teste-123");
  assert.equal(await checkPassword("Senha-de-teste-123", hash), true);
  assert.equal(await checkPassword("Senha-incorreta", hash), false);
  assert.notEqual(hash, await hashPassword("Senha-de-teste-123"));
});
test("planos, trial e permissões centralizados", () => {
  const s = {
    plan: "START" as const,
    billingCycle: "MONTHLY",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: new Date(0),
  };
  assert.equal(getLimit(s, "vehicles"), 15);
  assert.equal(getLimit({ ...s, subscriptionStatus: "TRIAL" }, "vehicles"), 5);
  assert.equal(getLimit({ ...s, plan: "PRO" }, "users"), 5);
  assert.equal(getLimit({ ...s, plan: "PERFORMANCE" }, "users"), 10);
  assert.equal(hasFeature(s, "site"), false);
  assert.equal(hasFeature({ ...s, billingCycle: "ANNUAL" }, "site"), true);
  assert.equal(hasFeature({ ...s, plan: "PERFORMANCE" }, "customDomain"), true);
  assert.equal(
    hasFeature({ ...s, billingCycle: "ANNUAL" }, "customDomain"),
    false,
  );
  assert.equal(canWrite({ ...s, subscriptionStatus: "TRIAL" }), false);
  assert.equal(canWrite({ ...s, subscriptionStatus: "SUSPENDED" }), false);
  assert.equal(usagePeriod({ ...s, subscriptionStatus: "TRIAL" }), "trial");
  assert.equal(can("SALESPERSON", "vehicles:write"), false);
  assert.equal(can("MANAGER", "users:manage"), false);
});
test("validação rejeita preço, ano e CNPJ inválidos", () => {
  assert.equal(
    vehicleSchema.safeParse({ ...vehicle, price: -1 }).success,
    false,
  );
  assert.equal(
    vehicleSchema.safeParse({ ...vehicle, yearModel: 1900 }).success,
    false,
  );
  assert.equal(
    dealershipSchema.safeParse({
      tradeName: "Teste",
      cnpj: "00000000000000",
      phone: "11999999999",
      city: "São Paulo",
      state: "SP",
    }).success,
    false,
  );
  assert.equal(
    dealershipSchema.safeParse({
      tradeName: "Teste",
      cnpj: "11222333000181",
      phone: "11999999999",
      city: "São Paulo",
      state: "SP",
    }).success,
    true,
  );
});
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
