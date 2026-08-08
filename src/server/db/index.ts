import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getSettings } from "../settings";
import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _overrideDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function setTestDb(db: unknown): void {
  _overrideDb = db as ReturnType<typeof drizzle<typeof schema>>;
}

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
  if (_overrideDb) return _overrideDb;
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

export { schema };
