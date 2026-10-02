import { vi } from "vitest";

const auth0Mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/server/db", async () => {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const schema = await import("@/server/db/schema");
  return { db: drizzle({ client: new PGlite(), schema }), schema };
});

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    getSession = auth0Mocks.getSession;
  },
}));

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

let pendingBgTasks: Promise<unknown>[] = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      pendingBgTasks.push(Promise.resolve(callback()));
    },
  };
});

vi.mock("@/server/avatar-generation", () => ({
  generateAvatar: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])),
}));

vi.mock("@/server/woa-generation", () => ({
  generateWoaImage: vi.fn().mockResolvedValue(Buffer.from("fake_woa")),
  generateMask: vi.fn().mockResolvedValue(Buffer.from("fake_mask")),
}));

vi.mock("@/server/wearable-classification", () => ({
  classifyWearableImage: vi.fn().mockResolvedValue("t-shirt"),
}));

const { mockBlobStorage } = vi.hoisted(() => {
  const data = new Map<string, Buffer>();
  return {
    mockBlobStorage: {
      async upload(bucket: string, key: string, value: Buffer | Uint8Array, _contentType: string) {
        data.set(`${bucket}/${key}`, Buffer.from(value));
      },
      async download(bucket: string, key: string): Promise<Buffer> {
        const value = data.get(`${bucket}/${key}`);
        if (!value) throw new Error(`No data for ${bucket}/${key}`);
        return value;
      },
      async getSignedUrl(bucket: string, key: string, _expiresIn?: number) {
        return `https://signed-url/${bucket}/${key}`;
      },
      clear() {
        data.clear();
      },
    },
  };
});

vi.mock("@/server/blob-storage", () => ({
  uploadBlob: mockBlobStorage.upload,
  downloadBlob: mockBlobStorage.download,
  getSignedBlobUrl: mockBlobStorage.getSignedUrl,
}));

export { mockBlobStorage };

export async function flushBackgroundTasks() {
  await Promise.all(pendingBgTasks);
  pendingBgTasks = [];
}

export function setSessionUser(sub: string | null) {
  auth0Mocks.getSession.mockImplementation(async () => (sub ? { user: { sub } } : null));
}
