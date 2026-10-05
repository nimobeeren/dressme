import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env/server";
import { isLocalUrl } from "./utils";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: env.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
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

// Preview pages keep these URLs around for the lifetime of a tab, so they are valid for 24 hours.
export async function getSignedBlobUrl(
  bucket: string,
  key: string,
  expiresIn = 24 * 60 * 60,
): Promise<string> {
  // Local MinIO has anonymous access enabled, so return a direct unsigned URL
  if (isLocalUrl(env.S3_ENDPOINT_URL)) {
    return `${env.S3_ENDPOINT_URL}/${bucket}/${key}`;
  }
  return s3GetSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn,
  });
}

/** Lists all object keys in a bucket. */
export async function listBlobs(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/** Deletes the given object keys from a bucket. Throws if any deletion fails. */
export async function deleteBlobs(bucket: string, keys: string[]): Promise<void> {
  // S3 accepts at most 1000 keys per delete request
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const response = await getClient().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((key) => ({ Key: key })), Quiet: true },
      }),
    );
    if (response.Errors?.length) {
      const details = response.Errors.map((error) => `${error.Key}: ${error.Message}`).join(", ");
      throw new Error(`Failed to delete objects from bucket '${bucket}': ${details}`);
    }
  }
}
