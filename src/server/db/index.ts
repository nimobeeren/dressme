import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getSettings } from "../settings";
import * as schema from "./schema";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: getSettings().DATABASE_URL,
      max: 5,
    });
  }
  return _pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
