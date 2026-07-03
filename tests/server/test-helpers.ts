import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, afterAll } from "vitest";
import * as schema from "../../src/server/db/schema";
import { setServices, resetServices } from "../../src/server/services";
import type { BlobStorage } from "../../src/server/blob-storage";
import type { JwtPayload } from "../../src/server/auth";

const TEST_USER_ID = "auth0|1";

export class MockBlobStorage implements BlobStorage {
  private _data = new Map<string, Buffer>();

  private key(bucket: string, key: string): string {
    return `${bucket}/${key}`;
  }

  async upload(
    bucket: string,
    key: string,
    data: Buffer | Uint8Array,
    _contentType: string,
  ): Promise<void> {
    this._data.set(this.key(bucket, key), Buffer.from(data));
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const data = this._data.get(this.key(bucket, key));
    if (!data) throw new Error(`No data found for ${bucket}/${key}`);
    return data;
  }

  async getSignedUrl(bucket: string, key: string, _expiresIn?: number): Promise<string> {
    return `https://signed-url/${bucket}/${key}`;
  }
}

export function createTestTokenPayload(sub = TEST_USER_ID): JwtPayload {
  return { sub };
}

export function getTestUserId(): string {
  return TEST_USER_ID;
}

export async function setupTestDb() {
  const pg = new PGlite();
  const db = drizzle({ client: pg, schema });

  // Create schema via DDL that matches the Drizzle schema
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auth0_user_id VARCHAR NOT NULL UNIQUE,
      selfie_image_key VARCHAR,
      avatar_image_key VARCHAR
    );

    CREATE TABLE IF NOT EXISTS "wearable" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      category VARCHAR NOT NULL,
      image_key VARCHAR NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wearable_user_id_idx ON "wearable"(user_id);

    CREATE TABLE IF NOT EXISTS "wearableonavatarimage" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      avatar_image_key VARCHAR NOT NULL,
      wearable_image_key VARCHAR NOT NULL,
      image_key VARCHAR NOT NULL,
      mask_image_key VARCHAR NOT NULL
    );
    CREATE INDEX IF NOT EXISTS woa_user_id_idx ON "wearableonavatarimage"(user_id);
    CREATE INDEX IF NOT EXISTS woa_avatar_image_key_idx ON "wearableonavatarimage"(avatar_image_key);
    CREATE INDEX IF NOT EXISTS woa_wearable_image_key_idx ON "wearableonavatarimage"(wearable_image_key);

    CREATE TABLE IF NOT EXISTS "outfit" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      top_id UUID NOT NULL REFERENCES "wearable"(id),
      bottom_id UUID NOT NULL REFERENCES "wearable"(id)
    );
    CREATE INDEX IF NOT EXISTS outfit_user_id_idx ON "outfit"(user_id);
  `);

  return db;
}

export function useTestDb() {
  let db: ReturnType<typeof setupTestDb> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    db = await setupTestDb();
    setServices({ db });
  });

  afterAll(() => {
    resetServices();
  });

  return {
    get db() {
      return db;
    },
  };
}
