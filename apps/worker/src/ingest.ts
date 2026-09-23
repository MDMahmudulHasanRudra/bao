import postgres from 'postgres';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { loadEnv } from '@bao/config';
import { getLogger } from './logger.js';

const env = loadEnv();
const log = getLogger('worker-ingest');

let _sql: ReturnType<typeof postgres> | null = null;
let _s3: S3Client | null = null;

function getSql() {
  if (_sql) return _sql;
  _sql = postgres(env.DATABASE_URL, { ssl: env.DATABASE_SSL });
  return _sql;
}

export function setSqlClientForTests(client: ReturnType<typeof postgres> | null) {
  _sql = client;
}

function getS3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
  });
  return _s3;
}

export async function closeSql() {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}

interface IngestJobData {
  sourceId: string;
  organizationId: string;
  storageKey?: string;
  url?: string;
  mimeType?: string;
}

interface SourceRow {
  id: string;
  organization_id: string;
  storage_key: string | null;
  mime_type: string | null;
  url: string | null;
}

const MAX_URL_FETCH_BYTES = 500_000;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.localdomain') ||
    h === 'metadata.google.internal' ||
    h === 'metadata' ||
    h.endsWith('.oraclecloud.internal')
  ) {
    return true;
  }
  const v = isIP(h);
  if (v === 4) return isPrivateIpv4(h);
  if (v === 6) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return false;
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL scheme must be http or https');
  }
  if (url.username || url.password) {
    throw new Error('URL must not contain credentials');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error('URL host is not allowed');
  }
  if (!isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    try {
      const records = await lookup(url.hostname, { all: true });
      if (records.length === 0 || records.some((r) => isBlockedHostname(r.address))) {
        throw new Error('URL host is not allowed');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'URL host is not allowed') throw err;
      throw new Error('URL host could not be resolved');
    }
  }
  return url;
}

async function fetchWithSsrfPolicy(rawUrl: string): Promise<string> {
  let current = await assertSafeUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetch(current.toString(), {
      method: 'GET',
      headers: { 'User-Agent': 'BusinessAIOS/1.0' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      if (redirect === MAX_REDIRECTS) throw new Error('Too many redirects');
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (
      contentType &&
      !contentType.startsWith('text/') &&
      !contentType.includes('html') &&
      !contentType.includes('xml')
    ) {
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    const declared = Number(response.headers.get('content-length') || '0');
    if (declared > MAX_URL_FETCH_BYTES) throw new Error('Response too large');

    const html = await response.text();
    if (html.length > MAX_URL_FETCH_BYTES) throw new Error('Response too large');
    return html;
  }
  throw new Error('Failed to fetch URL');
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text: string, maxTokens: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start = end - overlap;
    if (start >= words.length) break;
  }
  return chunks.length > 0 ? chunks : [text];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (buffer.length === 0) throw new Error('Empty document buffer');
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8');
  }
  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    if (!data.text?.trim()) throw new Error('PDF contained no extractable text');
    return data.text;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value?.trim()) throw new Error('DOCX contained no extractable text');
    return result.value;
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}

export async function loadSource(sourceId: string, organizationId: string): Promise<SourceRow> {
  const sql = getSql();
  const rows = await sql<SourceRow[]>`
    SELECT id, organization_id, storage_key, mime_type, url
    FROM knowledge_sources
    WHERE id = ${sourceId} AND organization_id = ${organizationId} AND deleted_at IS NULL
  `;
  if (rows.length !== 1) {
    throw new Error('Knowledge source not found for organization');
  }
  return rows[0];
}

async function setStatus(
  sourceId: string,
  organizationId: string,
  status: string,
  extra?: { chunkCount?: number; error?: string },
) {
  const sql = getSql();
  const sets = ['status = $3', 'updated_at = now()'];
  const params: unknown[] = [sourceId, organizationId, status];
  if (extra?.chunkCount !== undefined) {
    params.push(extra.chunkCount);
    sets.push(`chunk_count = $${params.length}`);
  }
  if (extra?.error !== undefined) {
    params.push(JSON.stringify({ error: extra.error }));
    sets.push(`metadata = $${params.length}`);
  }
  const rows = await sql.unsafe<unknown[]>(
    `UPDATE knowledge_sources SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id`,
    params as never[],
  );
  if (!rows.length) throw new Error('Knowledge source not found for organization');
}

async function replaceChunks(
  sourceId: string,
  organizationId: string,
  chunks: string[],
): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM knowledge_chunks WHERE source_id = ${sourceId} AND organization_id = ${organizationId}`;
    for (let i = 0; i < chunks.length; i++) {
      await tx`
        INSERT INTO knowledge_chunks (id, source_id, organization_id, content, chunk_index, token_count, created_at)
        VALUES (gen_random_uuid(), ${sourceId}, ${organizationId}, ${chunks[i]}, ${i}, ${estimateTokens(chunks[i])}, now())
      `;
    }
  });
}

async function downloadSourceObject(source: SourceRow): Promise<Buffer> {
  if (!source.storage_key) throw new Error('Source has no storage object');
  const prefix = `org/${source.organization_id}/`;
  if (!source.storage_key.startsWith(prefix)) {
    throw new Error('Storage key is outside the source organization');
  }
  const client = getS3();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: source.storage_key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  } catch (err) {
    throw new Error(`Failed to download storage object: ${(err as Error).message}`);
  }
}

export async function processDocument(jobData: IngestJobData) {
  const { sourceId, organizationId } = jobData;
  log.info({ sourceId, organizationId }, 'Processing document');

  const source = await loadSource(sourceId, organizationId);
  const orgId = source.organization_id;

  try {
    await setStatus(sourceId, orgId, 'processing');
    const buffer = await downloadSourceObject(source);
    const text = await extractText(buffer, source.mime_type || jobData.mimeType || '');
    if (!text.trim()) throw new Error('Extraction produced empty content');

    const chunks = chunkText(text, 500, 50);
    await replaceChunks(sourceId, orgId, chunks);
    await setStatus(sourceId, orgId, 'ready', { chunkCount: chunks.length });

    log.info({ sourceId, chunks: chunks.length }, 'Document processed');
  } catch (err) {
    log.error({ sourceId, err }, 'Document processing failed');
    await setStatus(sourceId, orgId, 'error', { error: (err as Error).message }).catch(
      () => undefined,
    );
    throw err;
  }
}

export async function processUrl(jobData: IngestJobData) {
  const { sourceId, organizationId, url } = jobData;
  log.info({ sourceId, url }, 'Processing URL source');

  const source = await loadSource(sourceId, organizationId);
  const orgId = source.organization_id;
  const target = source.url || url;

  try {
    await setStatus(sourceId, orgId, 'processing');
    if (!target) throw new Error('Source has no URL');

    const html = await fetchWithSsrfPolicy(target);
    const text = stripHtml(html);
    if (!text) throw new Error('URL extraction produced empty content');

    const chunks = chunkText(text, 500, 50);
    await replaceChunks(sourceId, orgId, chunks);
    await setStatus(sourceId, orgId, 'ready', { chunkCount: chunks.length });

    log.info({ sourceId, chunks: chunks.length }, 'URL source processed');
  } catch (err) {
    log.error({ sourceId, err }, 'URL processing failed');
    await setStatus(sourceId, orgId, 'error', { error: (err as Error).message }).catch(
      () => undefined,
    );
    throw err;
  }
}
