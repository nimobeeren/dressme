import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getSettings } from "../settings";
import { isLocalUrl } from "../utils";
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
  const url = getSettings().DATABASE_URL;

  // Use node-postgress for local DB in development since neon-http does not support it
  if (isLocalUrl(url)) {
    return drizzleNodePostgres(getPool(), { schema });
  }

  return drizzleNeonHttp(url, { schema });
}

export { schema };
