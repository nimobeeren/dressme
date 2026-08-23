import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSettings } from "./settings";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    const settings = getSettings();
    _client = new S3Client({
      endpoint: settings.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: settings.S3_ACCESS_KEY_ID,
        secretAccessKey: settings.S3_SECRET_ACCESS_KEY,
      },
      // R2 requires region_name "auto" and signature_version "s3v4"
      // MinIO requires path-style addressing to avoid redirect issues
      region: "auto",
      forcePathStyle: true,
    });
  }
  return _client;
}

export interface BlobStorage {
  upload(
    bucket: string,
    key: string,
    data: Buffer | Uint8Array,
    contentType: string,
  ): Promise<void>;
  download(bucket: string, key: string): Promise<Buffer>;
  getSignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
}

let _blobStorage: BlobStorage | undefined;
export function getBlobStorage(): BlobStorage {
  if (!_blobStorage) _blobStorage = new R2Storage();
  return _blobStorage;
}

export class R2Storage implements BlobStorage {
  async upload(
    bucket: string,
    key: string,
    data: Buffer | Uint8Array,
    contentType: string,
  ): Promise<void> {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(data),
        ContentType: contentType,
      }),
    );
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const response = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async getSignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
    const settings = getSettings();

    // In development, return a direct URL without signing
    // because MinIO has anonymous access enabled
    if (settings.MODE === "development") {
      return `${settings.S3_ENDPOINT_URL}/${bucket}/${key}`;
    }
    return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn,
    });
  }
}
