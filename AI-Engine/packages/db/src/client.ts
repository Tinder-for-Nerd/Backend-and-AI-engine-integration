import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(process.cwd(), ".env"), override: false });
config({ path: resolve(process.cwd(), "../../.env"), override: false });
config({ path: resolve(here, "../../../.env"), override: false });
config({ path: resolve(here, "../../../../.env"), override: false });

export type DbClient = ReturnType<typeof createDb>;

export function createDb(databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tfn") {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase transaction-mode pooler does not support prepared statements.
    prepare: false,
  });

  return drizzle(sql, { schema });
}

export const db = createDb();
