import { Pool } from "pg";
import { migrations } from "../src/server/db";

async function main() {
  if (!process.env.DATABASE_URL) {
    await (await import("../src/server/db")).getDb();
    console.log("Banco local pronto.");
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Each migration is idempotent, so replaying the set is safe.
    for (const statements of await migrations()) await pool.query(statements);
  } finally {
    await pool.end();
  }
  console.log("Migrações aplicadas.");
}

main().catch((error) => {
  console.error(
    "Falha ao aplicar migração:",
    error instanceof Error ? error.message : "erro desconhecido",
  );
  process.exitCode = 1;
});
