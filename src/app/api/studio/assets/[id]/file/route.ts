import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireTenant } from "@/server/auth";
import { getDb } from "@/server/db";
import { generatedAssets } from "@/server/schema";
import { getStorage } from "@/server/storage";
import { failure } from "@/server/http";
import { AppError } from "@/domain/policies";
import { assertPermission } from "@/domain/policies";
/** Serve a peça gerada. O bucket é privado: a autorização acontece aqui. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTenant();
    assertPermission(ctx.membership.role, "studio:read");
    const db = await getDb();
    const [asset] = await db
      .select()
      .from(generatedAssets)
      .where(
        and(
          eq(generatedAssets.id, (await params).id),
          eq(generatedAssets.dealershipId, ctx.dealership.id),
        ),
      );
    if (!asset) throw new AppError("Peça não encontrada.", 404);
    const data = await getStorage().get(asset.storageKey);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="card-${String(asset.position).padStart(2, "0")}.png"`,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
