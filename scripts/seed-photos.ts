import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import {
  users,
  dealerships,
  memberships,
  vehicles,
  vehicleMedia,
} from "../src/server/schema";
import { uploadMedia } from "../src/services/media";

// Attaches the demo photos to vehicles that already exist, since db:seed skips
// a demo it has already created. Vehicles that still have media are left alone.
const photos: Record<string, string> = {
  Jetta: "jetta.jpg",
  Corolla: "corolla.jpg",
  "Onix Plus": "onix-plus.jpg",
};

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo photos are disabled in production.");
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, "demo@autoweb.example"));
  if (!user) throw new Error("Demo não encontrada. Rode npm run db:seed antes.");
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  const [dealership] = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, membership.dealershipId));
  const ctx = { user, dealership, membership };

  for (const vehicle of await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.dealershipId, dealership.id))) {
    const photo = photos[vehicle.model];
    if (!photo) continue;
    const existing = await db
      .select()
      .from(vehicleMedia)
      .where(
        and(
          eq(vehicleMedia.vehicleId, vehicle.id),
          eq(vehicleMedia.dealershipId, dealership.id),
        ),
      );
    if (existing.length) {
      console.log(`· ${vehicle.model} já tem foto; nada alterado.`);
      continue;
    }
    await uploadMedia(
      ctx,
      vehicle.id,
      new File(
        [await readFile(path.join(process.cwd(), "assets/demo", photo))],
        photo,
        { type: "image/jpeg" },
      ),
    );
    console.log(`✓ ${vehicle.model}: ${photo}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Falha ao aplicar fotos");
    process.exit(1);
  });
