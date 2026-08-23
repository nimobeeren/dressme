import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { getSettings } from "../settings";
import { isLocalUrl } from "../utils";
import * as schema from "./schema";

const url = getSettings().DATABASE_URL;

// Use node-postgress for local DB in development since neon-http only supports
// Neon instances
export const db = isLocalUrl(url)
  ? drizzleNodePostgres(url, { schema })
  : drizzleNeonHttp(url, { schema });

export { schema };
