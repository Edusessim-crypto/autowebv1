import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { users } from "../src/server/schema";
import { hashPassword } from "../src/server/auth";

async function main() {
  const db = await getDb();

  const email = "demo@autoweb.example";
  const password = "AutoWebDemo2026!";

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (!existing.length) {
    console.log("❌ Usuário demo NÃO existe no banco.");
    return;
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
    })
    .where(eq(users.email, email));

  console.log("✅ Senha redefinida com sucesso.");
  console.log(`E-mail: ${email}`);
  console.log(`Senha: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});