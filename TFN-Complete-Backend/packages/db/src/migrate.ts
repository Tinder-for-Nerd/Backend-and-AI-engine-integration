import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(process.cwd(), ".env"), override: false });
config({ path: resolve(process.cwd(), "../../.env"), override: false });
config({ path: resolve(here, "../../../.env"), override: false });
config({ path: resolve(here, "../../../../.env"), override: false });

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tfn";
const sql = postgres(databaseUrl, {
  max: 1,
  // Supabase transaction-mode pooler does not support prepared statements.
  prepare: false,
});
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./drizzle" });
await sql.end();

console.log("Database migrations applied.");
