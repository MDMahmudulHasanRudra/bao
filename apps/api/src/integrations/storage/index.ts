import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '../../core/config/env.js';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  const env = getEnv();
  _client = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
  });
  return _client;
}

export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
  const env = getEnv();
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function getFileUrl(key: string, expiresIn = 3600): Promise<string> {
  const env = getEnv();
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function downloadFile(key: string): Promise<Buffer> {
  const env = getEnv();
  const client = getClient();
  const res = await client.send(new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function deleteFile(key: string): Promise<void> {
  const env = getEnv();
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
}

export function buildTenantKey(organizationId: string, ...parts: string[]): string {
  return `org/${organizationId}/${parts.join('/')}`;
}
