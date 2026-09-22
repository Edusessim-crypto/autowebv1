import { Pool } from "pg";
import { readFile } from "node:fs/promises";
async function main() {
  if (!process.env.DATABASE_URL) {
    await (await import("../src/server/db")).getDb();
    console.log("Banco local pronto.");
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(await readFile("migrations/0001_foundation.sql", "utf8"));
  await pool.end();
  console.log("Migração aplicada.");
}
main().catch(() => {
  console.error("Falha ao aplicar migração. Confira a configuração do banco.");
  process.exitCode = 1;
});
