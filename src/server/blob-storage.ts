import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSettings } from "./settings";
import { isLocalUrl } from "./utils";

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

export async function uploadBlob(
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

export async function downloadBlob(bucket: string, key: string): Promise<Buffer> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function getSignedBlobUrl(
  bucket: string,
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const settings = getSettings();

  // Local MinIO has anonymous access enabled, so return a direct unsigned URL
  if (isLocalUrl(settings.S3_ENDPOINT_URL)) {
    return `${settings.S3_ENDPOINT_URL}/${bucket}/${key}`;
  }
  return s3GetSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn,
  });
}
