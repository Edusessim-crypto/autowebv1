import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as schema from "./schema";
type Database = ReturnType<typeof drizzle<typeof schema>>;
const globalDb = globalThis as unknown as { autowebDb?: Promise<Database> };
export async function getDb(): Promise<Database> {
  globalDb.autowebDb ??= (async () => {
    if (process.env.DATABASE_URL)
      return drizzle(
        new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }),
        { schema },
      );
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOCAL_DB !== "true"
    )
      throw new Error("DATABASE_URL is required in production.");
    const directory = path.resolve(
      /* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || ".data",
    );
    await mkdir(directory, { recursive: true });
    const client = new PGlite(path.join(directory, "postgres"));
    await client.exec(
      await readFile(
        path.join(process.cwd(), "migrations/0001_foundation.sql"),
        "utf8",
      ),
    );
    // Both adapters execute the same PostgreSQL schema and Drizzle query API.
    return drizzleLite(client, { schema }) as unknown as Database;
  })();
  return globalDb.autowebDb;
}
