import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireTenant } from "@/server/auth";
import { getDb } from "@/server/db";
import { vehicleMedia, dealerships } from "@/server/schema";
import { getStorage } from "@/server/storage";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { AppError, assertPermission } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
type Context = { params: Promise<{ id: string }> };
async function find(id: string, dealershipId: string) {
  const db = await getDb();
  const [item] = await db
    .select()
    .from(vehicleMedia)
    .where(
      and(eq(vehicleMedia.id, id), eq(vehicleMedia.dealershipId, dealershipId)),
    );
  if (!item) throw new AppError("Foto não encontrada.", 404);
  return item;
}
export async function GET(request: Request, { params }: Context) {
  try {
    const ctx = await requireTenant();
    const item = await find((await params).id, ctx.dealership.id);
    const data = await getStorage().get(
      new URL(request.url).searchParams.get("size") === "thumb"
        ? item.thumbnailKey
        : item.storageKey,
    );
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    const ctx = await requireTenant();
    assertPermission(ctx.membership.role, "vehicles:write");
    if (!canWrite(ctx.dealership))
      throw new AppError("Seu período de teste terminou.", 402);
    const item = await find((await params).id, ctx.dealership.id);
    const body = (await jsonBody(request)) as { action?: string };
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(dealerships)
        .where(eq(dealerships.id, ctx.dealership.id))
        .for("update");
      const filter = and(
        eq(vehicleMedia.vehicleId, item.vehicleId),
        eq(vehicleMedia.dealershipId, ctx.dealership.id),
      );
      if (body.action === "cover") {
        await tx.update(vehicleMedia).set({ isCover: false }).where(filter);
        await tx
          .update(vehicleMedia)
          .set({ isCover: true })
          .where(
            and(
              eq(vehicleMedia.id, item.id),
              eq(vehicleMedia.dealershipId, ctx.dealership.id),
            ),
          );
      } else if (body.action === "earlier") {
        const rows = await tx
          .select()
          .from(vehicleMedia)
          .where(filter)
          .orderBy(vehicleMedia.position);
        const idx = rows.findIndex((r) => r.id === item.id);
        if (idx > 0) {
          await tx
            .update(vehicleMedia)
            .set({ position: rows[idx - 1].position })
            .where(eq(vehicleMedia.id, item.id));
          await tx
            .update(vehicleMedia)
            .set({ position: item.position })
            .where(eq(vehicleMedia.id, rows[idx - 1].id));
        }
      } else throw new AppError("Ação inválida.");
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    assertOrigin(request);
    const ctx = await requireTenant();
    assertPermission(ctx.membership.role, "vehicles:write");
    if (!canWrite(ctx.dealership))
      throw new AppError("Seu período de teste terminou.", 402);
    const item = await find((await params).id, ctx.dealership.id);
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(dealerships)
        .where(eq(dealerships.id, ctx.dealership.id))
        .for("update");
      await tx
        .delete(vehicleMedia)
        .where(
          and(
            eq(vehicleMedia.id, item.id),
            eq(vehicleMedia.dealershipId, ctx.dealership.id),
          ),
        );
      if (item.isCover) {
        const [first] = await tx
          .select()
          .from(vehicleMedia)
          .where(
            and(
              eq(vehicleMedia.vehicleId, item.vehicleId),
              eq(vehicleMedia.dealershipId, ctx.dealership.id),
            ),
          )
          .orderBy(vehicleMedia.position)
          .limit(1);
        if (first)
          await tx
            .update(vehicleMedia)
            .set({ isCover: true })
            .where(eq(vehicleMedia.id, first.id));
      }
    });
    await getStorage().remove(item.storageKey);
    await getStorage().remove(item.thumbnailKey);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
