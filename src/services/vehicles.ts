import { randomUUID } from "node:crypto";
import { and, eq, desc, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  vehicles,
  usage,
  auditLogs,
  vehicleMedia,
  dealerships,
} from "@/server/schema";
import type { TenantContext } from "@/server/auth";
import { assertPermission, AppError } from "@/domain/policies";
import { canWrite, getLimit, usagePeriod } from "@/domain/plans";
import { vehicleSchema, type VehicleInput } from "@/domain/validation";
export async function listVehicles(
  ctx: TenantContext,
  options: {
    search?: string;
    status?: string;
    sort?: string;
    page?: number;
  } = {},
) {
  assertPermission(ctx.membership.role, "vehicles:read");
  const db = await getDb();
  const filters = [eq(vehicles.dealershipId, ctx.dealership.id)];
  if (options.search) {
    const term = `%${options.search.slice(0, 100).replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(
      or(
        ilike(vehicles.brand, term),
        ilike(vehicles.model, term),
        ilike(vehicles.plate, term),
      )!,
    );
  }
  if (options.status && options.status !== "ALL")
    filters.push(eq(vehicles.status, options.status as VehicleInput["status"]));
  const page = Math.max(1, Math.floor(options.page || 1));
  const condition = and(...filters);
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vehicles)
    .where(condition);
  const rows = await db
    .select()
    .from(vehicles)
    .where(condition)
    .orderBy(
      options.sort === "price"
        ? vehicles.price
        : options.sort === "oldest"
          ? vehicles.createdAt
          : desc(vehicles.createdAt),
    )
    .limit(12)
    .offset((page - 1) * 12);
  const items = await Promise.all(
    rows.map(async (v) => {
      const [cover] = await db
        .select()
        .from(vehicleMedia)
        .where(
          and(
            eq(vehicleMedia.vehicleId, v.id),
            eq(vehicleMedia.dealershipId, ctx.dealership.id),
          ),
        )
        .orderBy(desc(vehicleMedia.isCover), vehicleMedia.position)
        .limit(1);
      return {
        ...v,
        coverUrl: cover ? `/api/media/${cover.id}?size=thumb` : null,
      };
    }),
  );
  return {
    items,
    total: total.count,
    page,
    pages: Math.max(1, Math.ceil(total.count / 12)),
  };
}
export async function getVehicle(ctx: TenantContext, id: string) {
  assertPermission(ctx.membership.role, "vehicles:read");
  const db = await getDb();
  const [v] = await db
    .select()
    .from(vehicles)
    .where(
      and(eq(vehicles.id, id), eq(vehicles.dealershipId, ctx.dealership.id)),
    );
  if (!v) throw new AppError("Veículo não encontrado.", 404);
  const media = await db
    .select()
    .from(vehicleMedia)
    .where(
      and(
        eq(vehicleMedia.vehicleId, id),
        eq(vehicleMedia.dealershipId, ctx.dealership.id),
      ),
    )
    .orderBy(desc(vehicleMedia.isCover), vehicleMedia.position);
  const history = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityId, id),
        eq(auditLogs.dealershipId, ctx.dealership.id),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(40);
  return { ...v, media, history };
}
export async function saveVehicle(
  ctx: TenantContext,
  input: unknown,
  id?: string,
) {
  assertPermission(ctx.membership.role, "vehicles:write");
  const creating = !id;
  const parsed = vehicleSchema.parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    // The row lock serializes quota checks, media mutations and vehicle writes per dealership.
    const [dealership] = await tx
      .select()
      .from(dealerships)
      .where(eq(dealerships.id, ctx.dealership.id))
      .for("update");
    if (!canWrite(dealership))
      throw new AppError(
        "Seu período de teste terminou. Consulte Plano e cobrança para continuar.",
        402,
      );
    const data = {
      ...parsed,
      price: Math.round(parsed.price * 100),
      updatedAt: new Date(),
    };
    if (id) {
      const [previous] = await tx
        .select()
        .from(vehicles)
        .where(
          and(eq(vehicles.id, id), eq(vehicles.dealershipId, dealership.id)),
        );
      if (!previous) throw new AppError("Veículo não encontrado.", 404);
      await tx
        .update(vehicles)
        .set({
          ...data,
          soldAt: data.status === "SOLD" ? previous.soldAt || new Date() : null,
        })
        .where(
          and(eq(vehicles.id, id), eq(vehicles.dealershipId, dealership.id)),
        );
    } else {
      const period = usagePeriod(dealership);
      await tx
        .insert(usage)
        .values({ id: randomUUID(), dealershipId: dealership.id, period })
        .onConflictDoNothing();
      const [current] = await tx
        .select()
        .from(usage)
        .where(
          and(eq(usage.dealershipId, dealership.id), eq(usage.period, period)),
        );
      if (current.vehicleCount >= getLimit(dealership, "vehicles"))
        throw new AppError(
          "Você atingiu o limite de novos veículos do período. Edições continuam disponíveis.",
          402,
        );
      id = randomUUID();
      await tx.insert(vehicles).values({
        ...data,
        id,
        dealershipId: dealership.id,
        createdById: ctx.user.id,
        soldAt: data.status === "SOLD" ? new Date() : null,
      });
      await tx
        .update(usage)
        .set({ vehicleCount: current.vehicleCount + 1 })
        .where(eq(usage.id, current.id));
    }
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: dealership.id,
      userId: ctx.user.id,
      entityId: id,
      event: creating
        ? "vehicle.created"
        : data.status === "SOLD"
          ? "vehicle.sold"
          : "vehicle.updated",
    });
    return id;
  });
}
export async function dashboard(ctx: TenantContext) {
  const db = await getDb();
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      stock: sql<number>`count(*) filter (where status <> 'SOLD')::int`,
      available: sql<number>`count(*) filter (where status = 'AVAILABLE')::int`,
      reserved: sql<number>`count(*) filter (where status = 'RESERVED')::int`,
      sold: sql<number>`count(*) filter (where status = 'SOLD' and date_trunc('month', sold_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'))::int`,
      value: sql<number>`coalesce(sum(price) filter (where status <> 'SOLD'),0)::float8`,
    })
    .from(vehicles)
    .where(eq(vehicles.dealershipId, ctx.dealership.id));
  const [current] = await db
    .select()
    .from(usage)
    .where(
      and(
        eq(usage.dealershipId, ctx.dealership.id),
        eq(usage.period, usagePeriod(ctx.dealership)),
      ),
    );
  return {
    ...counts,
    used: current?.vehicleCount || 0,
    limit: getLimit(ctx.dealership, "vehicles"),
  };
}
