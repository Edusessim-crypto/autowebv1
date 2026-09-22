import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireTenant } from "@/server/auth";
import { assertOrigin, failure } from "@/server/http";
import { AppError, assertPermission } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import { getDb } from "@/server/db";
import { dealerships } from "@/server/schema";
import { getStorage } from "@/server/storage";
import { imageBuffers } from "@/services/media";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const ctx = await requireTenant();
    assertPermission(ctx.membership.role, "dealership:configure");
    if (!canWrite(ctx.dealership))
      throw new AppError("Seu período de teste terminou.", 402);
    if (Number(request.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new AppError("Imagem muito grande.", 413);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new AppError("Selecione a logo.");
    const { image } = await imageBuffers(file);
    const key = `${ctx.dealership.id}/branding/${randomUUID()}.webp`;
    await getStorage().put(key, image);
    await (
      await getDb()
    )
      .update(dealerships)
      .set({ logoUrl: key, updatedAt: new Date() })
      .where(eq(dealerships.id, ctx.dealership.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const ctx = await requireTenant();
    if (!ctx.dealership.logoUrl)
      throw new AppError("Logo não cadastrada.", 404);
    return new NextResponse(
      new Uint8Array(await getStorage().get(ctx.dealership.logoUrl)),
      {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "private, no-cache",
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
