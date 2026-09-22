import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { TenantContext } from "@/server/auth";
import { getDb } from "@/server/db";
import { vehicleMedia, dealerships } from "@/server/schema";
import { getStorage } from "@/server/storage";
import { getVehicle } from "./vehicles";
import { AppError, assertPermission } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
export async function imageBuffers(file: File) {
  if (file.size > 10 * 1024 * 1024)
    throw new AppError("Cada imagem pode ter até 10 MB.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !/\.(jpe?g|png|webp)$/i.test(file.name)
  )
    throw new AppError("Use imagens JPG, PNG ou WebP.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
  } catch {
    throw new AppError("A imagem não pôde ser lida.");
  }
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    (metadata.pages || 1) > 1
  )
    throw new AppError("Use uma imagem estática válida.");
  return {
    image: await sharp(bytes)
      .rotate()
      .resize(1800, 1400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer(),
    thumb: await sharp(bytes)
      .rotate()
      .resize(560, 420, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  };
}
export async function uploadMedia(
  ctx: TenantContext,
  vehicleId: string,
  file: File,
) {
  assertPermission(ctx.membership.role, "vehicles:write");
  await getVehicle(ctx, vehicleId);
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  const { image, thumb } = await imageBuffers(file);
  const id = randomUUID();
  const storageKey = `${ctx.dealership.id}/vehicles/${id}.webp`;
  const thumbnailKey = `${ctx.dealership.id}/vehicles/${id}-thumb.webp`;
  const storage = getStorage();
  await storage.put(storageKey, image);
  await storage.put(thumbnailKey, thumb);
  try {
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(dealerships)
        .where(eq(dealerships.id, ctx.dealership.id))
        .for("update");
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(vehicleMedia)
        .where(
          and(
            eq(vehicleMedia.vehicleId, vehicleId),
            eq(vehicleMedia.dealershipId, ctx.dealership.id),
          ),
        );
      if (count.n >= 30) throw new AppError("Limite de 30 fotos por veículo.");
      await tx
        .insert(vehicleMedia)
        .values({
          id,
          dealershipId: ctx.dealership.id,
          vehicleId,
          storageKey,
          thumbnailKey,
          position: count.n,
          isCover: count.n === 0,
        });
    });
  } catch (e) {
    await storage.remove(storageKey);
    await storage.remove(thumbnailKey);
    throw e;
  }
  return id;
}
