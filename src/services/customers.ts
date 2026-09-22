import { randomUUID } from "node:crypto";
import { and, eq, desc, ilike, or, sql, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { customers, leads, auditLogs, users } from "@/server/schema";
import type { TenantContext } from "@/server/auth";
import { assertPermission, AppError } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import { customerSchema } from "@/domain/validation";
import { isClosed, normalizePhone } from "@/domain/crm";

const perPage = 20;

export async function listCustomers(
  ctx: TenantContext,
  options: { search?: string; page?: number } = {},
) {
  assertPermission(ctx.membership.role, "crm:manage");
  const db = await getDb();
  const filters = [eq(customers.dealershipId, ctx.dealership.id)];
  if (options.search) {
    const raw = options.search.slice(0, 100);
    const term = `%${raw.replace(/[%_\\]/g, "\\$&")}%`;
    const digits = normalizePhone(raw) || raw.replace(/\D/g, "");
    const matches = [ilike(customers.name, term), ilike(customers.email, term)];
    // A phone search only makes sense against the digits we stored.
    if (digits) {
      const byDigits = `%${digits}%`;
      matches.push(
        ilike(customers.phone, byDigits),
        ilike(customers.whatsapp, byDigits),
      );
    }
    filters.push(or(...matches)!);
  }
  const condition = and(...filters);
  const page = Math.max(1, Math.floor(options.page || 1));
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(condition);
  const rows = await db
    .select()
    .from(customers)
    .where(condition)
    .orderBy(desc(customers.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // One grouped query instead of one per row.
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          customerId: leads.customerId,
          open: sql<number>`count(*) filter (where ${leads.stage} not in ('WON','LOST'))::int`,
          lastContactAt: sql<Date | null>`max(${leads.lastContactAt})`,
        })
        .from(leads)
        .where(
          and(
            eq(leads.dealershipId, ctx.dealership.id),
            inArray(leads.customerId, ids),
          ),
        )
        .groupBy(leads.customerId)
    : [];
  const byCustomer = new Map(counts.map((c) => [c.customerId, c]));
  return {
    items: rows.map((row) => ({
      ...row,
      openLeads: byCustomer.get(row.id)?.open ?? 0,
      lastContactAt: byCustomer.get(row.id)?.lastContactAt ?? null,
    })),
    total: total.count,
    page,
    pages: Math.max(1, Math.ceil(total.count / perPage)),
  };
}

export async function getCustomer(ctx: TenantContext, id: string) {
  assertPermission(ctx.membership.role, "crm:manage");
  const db = await getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(eq(customers.id, id), eq(customers.dealershipId, ctx.dealership.id)),
    );
  if (!customer) throw new AppError("Cliente não encontrado.", 404);
  return customer;
}

export async function saveCustomer(
  ctx: TenantContext,
  input: unknown,
  id?: string,
) {
  assertPermission(ctx.membership.role, "crm:manage");
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const data = customerSchema.parse(input);
  const db = await getDb();
  if (id) {
    await getCustomer(ctx, id);
    await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.dealershipId, ctx.dealership.id),
        ),
      );
    await audit(ctx, id, "customer.updated");
    return id;
  }
  const newId = randomUUID();
  await db.insert(customers).values({
    ...data,
    id: newId,
    dealershipId: ctx.dealership.id,
    createdById: ctx.user.id,
  });
  await audit(ctx, newId, "customer.created");
  return newId;
}

// Surfaces likely duplicates so the UI can warn before creating another record.
export async function findByContact(ctx: TenantContext, contact: string) {
  const digits = normalizePhone(contact);
  if (!digits) return [];
  const db = await getDb();
  return db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.dealershipId, ctx.dealership.id),
        or(eq(customers.phone, digits), eq(customers.whatsapp, digits))!,
      ),
    )
    .limit(5);
}

export async function customerHistory(ctx: TenantContext, customerId: string) {
  await getCustomer(ctx, customerId);
  const db = await getDb();
  const rows = await db
    .select({
      lead: leads,
      assignedName: users.name,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedToUserId))
    .where(
      and(
        eq(leads.dealershipId, ctx.dealership.id),
        eq(leads.customerId, customerId),
      ),
    )
    .orderBy(desc(leads.updatedAt));
  return {
    open: rows.filter((r) => !isClosed(r.lead.stage)),
    closed: rows.filter((r) => isClosed(r.lead.stage)),
  };
}

async function audit(ctx: TenantContext, entityId: string, event: string) {
  const db = await getDb();
  await db.insert(auditLogs).values({
    id: randomUUID(),
    dealershipId: ctx.dealership.id,
    userId: ctx.user.id,
    entityId,
    event,
  });
}
