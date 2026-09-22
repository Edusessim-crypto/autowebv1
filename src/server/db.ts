import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import * as schema from "./schema";

// Every migration, in filename order. Each one is idempotent, so replaying the
// whole set is how both adapters reach the current schema.
export async function migrations() {
  const directory = path.join(process.cwd(), "migrations");
  const files = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return Promise.all(
    files.map((name) => readFile(path.join(directory, name), "utf8")),
  );
}
type Database = ReturnType<typeof drizzle<typeof schema>>;
const globalDb = globalThis as unknown as { autowebDb?: Promise<Database> };
export async function getDb(): Promise<Database> {
  globalDb.autowebDb ??= (async () => {
    if (process.env.DATABASE_URL)
      return drizzle(
        new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
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
    for (const statements of await migrations()) await client.exec(statements);
    // Both adapters execute the same PostgreSQL schema and Drizzle query API.
    return drizzleLite(client, { schema }) as unknown as Database;
  })();
  return globalDb.autowebDb;
}
