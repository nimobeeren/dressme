import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, test as baseTest, vi } from "vitest";
import sharp from "sharp";
import * as schema from "@/server/db/schema";
import { flushBackgroundTasks, mockBlobStorage, setSessionUser } from "./mocks";

export { flushBackgroundTasks, mockBlobStorage, setSessionUser } from "./mocks";
export { randomUUID };

export type TestDb = PgliteDatabase<typeof schema>;
export { schema };

export const TEST_USER_ID = "auth0|1";

export const test = baseTest
  // eslint-disable-next-line no-empty-pattern -- vitest requires the destructured context signature
  .extend("dbClient", { scope: "file" }, async ({}, { onCleanup }) => {
    const { db } = await import("@/server/db");
    const client = db.$client as unknown as PGlite;
    await migrate(db as any, {
      migrationsFolder: join(import.meta.dirname, "..", "..", "..", "drizzle"),
    });
    onCleanup(() => client.close());
    return client;
  })
  .extend("db", async ({ dbClient }) => drizzle(dbClient, { schema }));

test.aroundEach(async (runTest, { dbClient }) => {
  await dbClient.exec("BEGIN");
  try {
    await runTest();
  } finally {
    await flushBackgroundTasks();
    await dbClient.exec("ROLLBACK");
  }
});

beforeEach(async () => {
  setSessionUser(TEST_USER_ID);
  vi.mocked(await import("next/cache")).updateTag.mockClear();
  mockBlobStorage.clear();
});

export async function makeValidJpeg(width = 10, height = 10): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

export async function makeValidJpeg2(width = 10, height = 10): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

export async function makeDecompressionBomb(): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

export function makeOversizedUpload(): Buffer<ArrayBuffer> {
  return Buffer.alloc(10 * 1024 * 1024 + 1, 0);
}

export { eq };
