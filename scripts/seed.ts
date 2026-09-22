import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { users, dealerships, memberships } from "../src/server/schema";
import { hashPassword } from "../src/server/auth";
import { saveVehicle } from "../src/services/vehicles";
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seed is disabled in production.");
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set DEMO_PASSWORD with at least 12 characters.");
  const db = await getDb();
  const email = "demo@autoweb.example";
  if ((await db.select().from(users).where(eq(users.email, email))).length) {
    console.log("Demonstração já existe; nenhum dado foi alterado.");
    return;
  }
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: "Alex · Demonstração",
      email,
      passwordHash: await hashPassword(password),
    })
    .returning();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      id: randomUUID(),
      tradeName: "Horizonte Seminovos · Demo",
      cnpj: "11222333000181",
      slug: "horizonte-demo",
      phone: "11000000000",
      city: "São Paulo",
      state: "SP",
      isDemo: true,
      trialEndsAt: new Date(Date.now() + 7 * 86400000),
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
  const examples = [
    {
      brand: "Volkswagen",
      model: "Jetta",
      version: "1.4 250 TSI Comfortline",
      yearManufacture: 2021,
      yearModel: 2022,
      mileage: 38400,
      price: 128900,
      color: "Preto",
      status: "AVAILABLE" as const,
    },
    {
      brand: "Toyota",
      model: "Corolla",
      version: "2.0 XEi Dynamic Force",
      yearManufacture: 2021,
      yearModel: 2021,
      mileage: 52100,
      price: 119900,
      color: "Prata",
      status: "AVAILABLE" as const,
    },
    {
      brand: "Chevrolet",
      model: "Onix Plus",
      version: "1.0 Turbo Premier",
      yearManufacture: 2022,
      yearModel: 2023,
      mileage: 19800,
      price: 89900,
      color: "Azul",
      status: "RESERVED" as const,
    },
  ];
  for (const v of examples)
    await saveVehicle(
      { user, dealership, membership },
      {
        ...v,
        transmission: "Automático",
        fuel: "Flex",
        plate: "",
        description: "Veículo fictício de demonstração.",
        options: [],
      },
    );
  console.log(
    "Demo criada: demo@autoweb.example. Use a senha fornecida em DEMO_PASSWORD.",
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Seed failed");
  process.exitCode = 1;
});
