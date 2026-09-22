import { randomUUID } from "node:crypto";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  leads,
  customers,
  vehicles,
  users,
  crmActivities,
  auditLogs,
  memberships,
} from "@/server/schema";
import type { TenantContext } from "@/server/auth";
import { assertPermission, AppError } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import {
  leadSchema,
  stageChangeSchema,
  activitySchema,
} from "@/domain/validation";
import {
  leadStages,
  seesEveryLead,
  canAssign,
  isClosed,
  type LeadStage,
  type ActivityType,
} from "@/domain/crm";

// The board shows a slice per column; deeper history lives in the lead detail.
const perColumn = 25;

// A salesperson only ever reads their own pipeline, enforced in SQL so the
// restriction cannot be bypassed by calling the API directly.
function visibility(ctx: TenantContext) {
  const scope = [eq(leads.dealershipId, ctx.dealership.id)];
  if (!seesEveryLead(ctx.membership.role))
    scope.push(eq(leads.assignedToUserId, ctx.user.id));
  return scope;
}

const cardColumns = {
  lead: leads,
  customerName: customers.name,
  customerPhone: customers.phone,
  customerWhatsapp: customers.whatsapp,
  vehicleBrand: vehicles.brand,
  vehicleModel: vehicles.model,
  assignedName: users.name,
};

function withRelations(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .select(cardColumns)
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .leftJoin(vehicles, eq(vehicles.id, leads.vehicleId))
    .leftJoin(users, eq(users.id, leads.assignedToUserId));
}

export async function board(ctx: TenantContext) {
  assertPermission(ctx.membership.role, "crm:manage");
  const db = await getDb();
  const scope = visibility(ctx);
  const totals = await db
    .select({ stage: leads.stage, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...scope))
    .groupBy(leads.stage);
  const byStage = new Map(totals.map((t) => [t.stage, t.count]));
  const columns = await Promise.all(
    leadStages.map(async (stage) => ({
      stage,
      total: byStage.get(stage) ?? 0,
      items: await withRelations(db)
        .where(and(...scope, eq(leads.stage, stage)))
        .orderBy(desc(leads.updatedAt))
        .limit(perColumn),
    })),
  );
  return columns;
}

export async function getLead(ctx: TenantContext, id: string) {
  assertPermission(ctx.membership.role, "crm:manage");
  const db = await getDb();
  const [row] = await withRelations(db).where(
    and(...visibility(ctx), eq(leads.id, id)),
  );
  if (!row) throw new AppError("Oportunidade não encontrada.", 404);
  const activities = await db
    .select({ activity: crmActivities, userName: users.name })
    .from(crmActivities)
    .innerJoin(users, eq(users.id, crmActivities.userId))
    .where(eq(crmActivities.leadId, id))
    .orderBy(desc(crmActivities.createdAt))
    .limit(50);
  return { ...row, activities };
}

export async function leadsForVehicle(ctx: TenantContext, vehicleId: string) {
  assertPermission(ctx.membership.role, "crm:manage");
  const db = await getDb();
  return withRelations(db)
    .where(and(...visibility(ctx), eq(leads.vehicleId, vehicleId)))
    .orderBy(desc(leads.updatedAt))
    .limit(50);
}

export async function countOpenLeadsByVehicle(
  ctx: TenantContext,
  vehicleIds: string[],
) {
  if (!vehicleIds.length) return new Map<string, number>();
  const db = await getDb();
  const rows = await db
    .select({ vehicleId: leads.vehicleId, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        ...visibility(ctx),
        inArray(leads.vehicleId, vehicleIds),
        sql`${leads.stage} not in ('WON','LOST')`,
      ),
    )
    .groupBy(leads.vehicleId);
  return new Map(rows.map((r) => [r.vehicleId as string, r.count]));
}

async function assertAssignable(ctx: TenantContext, userId: string | null) {
  if (!userId) return;
  if (!canAssign(ctx.membership.role, ctx.user.id, userId))
    throw new AppError("Você só pode atribuir oportunidades a você.", 403);
  const db = await getDb();
  const [member] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.dealershipId, ctx.dealership.id),
        eq(memberships.status, "ACTIVE"),
      ),
    );
  if (!member) throw new AppError("Vendedor não encontrado na revenda.", 400);
}

async function assertCustomer(ctx: TenantContext, customerId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.dealershipId, ctx.dealership.id),
      ),
    );
  if (!row) throw new AppError("Cliente não encontrado.", 404);
}

async function assertVehicle(ctx: TenantContext, vehicleId: string | null) {
  if (!vehicleId) return;
  const db = await getDb();
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.dealershipId, ctx.dealership.id),
      ),
    );
  if (!row) throw new AppError("Veículo não encontrado.", 404);
}

export async function createLead(ctx: TenantContext, input: unknown) {
  assertPermission(ctx.membership.role, "crm:manage");
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const data = leadSchema.parse(input);
  await assertCustomer(ctx, data.customerId);
  await assertVehicle(ctx, data.vehicleId);
  await assertAssignable(ctx, data.assignedToUserId);
  const db = await getDb();
  const id = randomUUID();
  // The lead and its opening activity belong together in the history.
  await db.transaction(async (tx) => {
    await tx.insert(leads).values({
      ...data,
      id,
      dealershipId: ctx.dealership.id,
      createdById: ctx.user.id,
    });
    await tx.insert(crmActivities).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      leadId: id,
      userId: ctx.user.id,
      type: "NOTE",
      content: "Oportunidade criada.",
    });
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: id,
      event: "lead.created",
    });
  });
  return id;
}

export async function updateLead(
  ctx: TenantContext,
  id: string,
  input: unknown,
) {
  await getLead(ctx, id);
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const data = leadSchema.parse(input);
  await assertCustomer(ctx, data.customerId);
  await assertVehicle(ctx, data.vehicleId);
  await assertAssignable(ctx, data.assignedToUserId);
  const db = await getDb();
  await db
    .update(leads)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.dealershipId, ctx.dealership.id)));
  return id;
}

export async function changeStage(
  ctx: TenantContext,
  id: string,
  input: unknown,
) {
  const current = await getLead(ctx, id);
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const { stage, lostReason } = stageChangeSchema.parse(input);
  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        stage,
        lostReason: stage === "LOST" ? lostReason : "",
        lastContactAt: now,
        updatedAt: now,
      })
      .where(and(eq(leads.id, id), eq(leads.dealershipId, ctx.dealership.id)));
    await tx.insert(crmActivities).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      leadId: id,
      userId: ctx.user.id,
      type: "STAGE_CHANGE",
      content: `${current.lead.stage} → ${stage}${
        stage === "LOST" && lostReason ? `: ${lostReason}` : ""
      }`,
    });
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: id,
      event:
        stage === "WON"
          ? "lead.won"
          : stage === "LOST"
            ? "lead.lost"
            : "lead.stage_changed",
    });
  });
  return id;
}

export async function assignLead(
  ctx: TenantContext,
  id: string,
  userId: string | null,
) {
  await getLead(ctx, id);
  await assertAssignable(ctx, userId);
  const db = await getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ assignedToUserId: userId, updatedAt: now })
      .where(and(eq(leads.id, id), eq(leads.dealershipId, ctx.dealership.id)));
    await tx.insert(crmActivities).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      leadId: id,
      userId: ctx.user.id,
      type: "ASSIGNMENT",
      content: userId ? "Responsável atualizado." : "Responsável removido.",
    });
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: id,
      event: "lead.assigned",
    });
  });
  return id;
}

export async function addActivity(
  ctx: TenantContext,
  id: string,
  input: unknown,
) {
  await getLead(ctx, id);
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const { type, content } = activitySchema.parse(input);
  const db = await getDb();
  const now = new Date();
  const touchesContact: ActivityType[] = ["CALL", "WHATSAPP", "NOTE"];
  await db.transaction(async (tx) => {
    await tx.insert(crmActivities).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      leadId: id,
      userId: ctx.user.id,
      type,
      content,
    });
    if (touchesContact.includes(type))
      await tx
        .update(leads)
        .set({ lastContactAt: now, updatedAt: now })
        .where(
          and(eq(leads.id, id), eq(leads.dealershipId, ctx.dealership.id)),
        );
  });
  return id;
}

export async function setNextAction(
  ctx: TenantContext,
  id: string,
  at: Date | null,
) {
  await getLead(ctx, id);
  const db = await getDb();
  await db
    .update(leads)
    .set({ nextActionAt: at, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.dealershipId, ctx.dealership.id)));
  return id;
}

// Dashboard figures: real counts, scoped to what the caller may see.
export async function crmSummary(ctx: TenantContext, since: Date) {
  const db = await getDb();
  const scope = visibility(ctx);
  const [fresh] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...scope, sql`${leads.createdAt} >= ${since}`));
  const [open] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...scope, sql`${leads.stage} not in ('WON','LOST')`));
  const [overdue] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        ...scope,
        sql`${leads.stage} not in ('WON','LOST')`,
        sql`${leads.nextActionAt} < now()`,
      ),
    );
  const recent = await withRelations(db)
    .where(and(...scope))
    .orderBy(desc(leads.createdAt))
    .limit(5);
  return {
    newLeads: fresh.count,
    openLeads: open.count,
    overdue: overdue.count,
    recent,
  };
}

export async function salespeople(ctx: TenantContext) {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.dealershipId, ctx.dealership.id),
        eq(memberships.status, "ACTIVE"),
      ),
    );
}

export { isClosed, type LeadStage };
