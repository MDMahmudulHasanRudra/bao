import postgres from 'postgres';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { loadEnv } from '@bao/config';
import { getLogger } from './logger.js';
import { assertSafeUrl } from './net/safe-url.js';

export { assertSafeUrl };

const env = loadEnv();
const log = getLogger('worker-ingest');

let _sql: ReturnType<typeof postgres> | null = null;
let _s3: S3Client | null = null;

export function getSql() {
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
  uploaded_by: string | null;
  title: string | null;
}

const MAX_URL_FETCH_BYTES = 500_000;
const MAX_REDIRECTS = 3;

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
    SELECT id, organization_id, storage_key, mime_type, url, uploaded_by, title
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

async function notifyReady(source: SourceRow) {
  if (!source.uploaded_by) return;
  try {
    const sql = getSql();
    await sql`
      INSERT INTO notifications (id, organization_id, user_id, type, title, body, link, metadata)
      VALUES (
        gen_random_uuid(),
        ${source.organization_id},
        ${source.uploaded_by},
        'knowledge.ready',
        ${`Knowledge ready: ${source.title || source.id}`},
        'Your source finished processing and is searchable.',
        '/knowledge',
        '{}'::jsonb
      )
    `;
  } catch {
    // Notification should never fail ingest
  }
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
    await notifyReady(source);

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
    await notifyReady(source);

    log.info({ sourceId, chunks: chunks.length }, 'URL source processed');
  } catch (err) {
    log.error({ sourceId, err }, 'URL processing failed');
    await setStatus(sourceId, orgId, 'error', { error: (err as Error).message }).catch(
      () => undefined,
    );
    throw err;
  }
}
