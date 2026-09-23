import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { knowledgeSources, knowledgeChunks } from '../../db/schema.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import {
  uploadFile,
  deleteFile,
  buildTenantKey,
  getFileUrl,
} from '../../integrations/storage/index.js';
import { createQueue } from '../../jobs/queue.js';

const knowledge = new Hono();
const ingestQueue = createQueue('knowledge-ingest');

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

knowledge.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const sources = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.organizationId, tenant.organizationId),
        isNull(knowledgeSources.deletedAt),
      ),
    )
    .orderBy(desc(knowledgeSources.createdAt));

  return c.json({ sources });
});

knowledge.post('/upload', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string) || file?.name || 'Untitled';
  const visibility = (formData.get('visibility') as string) || 'private';

  if (!file) throw new ValidationError({ file: 'File is required' });
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ValidationError({
      file: `Unsupported type: ${file.type}. Allowed: PDF, DOCX, TXT, MD`,
    });
  }
  if (file.size > MAX_SIZE) {
    throw new ValidationError({ file: `File too large. Max: ${MAX_SIZE / 1024 / 1024}MB` });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildTenantKey(
    tenant.organizationId,
    'knowledge',
    `${Date.now()}-${file.name}`,
  );

  await uploadFile(storageKey, buffer, file.type);

  const [source] = await db
    .insert(knowledgeSources)
    .values({
      organizationId: tenant.organizationId,
      title,
      type: 'file',
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
      visibility,
      status: 'pending',
      uploadedBy: tenant.userId,
    })
    .returning();

  await ingestQueue.add('process-document', {
    sourceId: source.id,
    organizationId: tenant.organizationId,
    storageKey,
    mimeType: file.type,
  });

  await audit(c, 'knowledge.upload', 'knowledge_source', source.id);

  return c.json({ source }, 201);
});

knowledge.post('/url', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{ url: string; title?: string; visibility?: string }>();
  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    throw new ValidationError({ url: 'Invalid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError({ url: 'URL scheme must be http or https' });
  }

  const [source] = await db
    .insert(knowledgeSources)
    .values({
      organizationId: tenant.organizationId,
      title: body.title || body.url,
      type: 'url',
      url: body.url,
      visibility: body.visibility || 'private',
      status: 'pending',
      uploadedBy: tenant.userId,
    })
    .returning();

  await ingestQueue.add('process-url', {
    sourceId: source.id,
    organizationId: tenant.organizationId,
    url: body.url,
  });

  await audit(c, 'knowledge.add_url', 'knowledge_source', source.id);

  return c.json({ source }, 201);
});

knowledge.get('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const sourceId = c.req.param('id');

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!source) throw new NotFoundError('Knowledge source', sourceId);

  return c.json({ source });
});

knowledge.delete('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const sourceId = c.req.param('id');

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!source) throw new NotFoundError('Knowledge source', sourceId);

  if (source.storageKey) await deleteFile(source.storageKey);

  await db
    .update(knowledgeSources)
    .set({ deletedAt: new Date() })
    .where(eq(knowledgeSources.id, sourceId));

  await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId));

  await audit(c, 'knowledge.delete', 'knowledge_source', sourceId);

  return c.json({ success: true });
});

knowledge.get('/:id/download', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const sourceId = c.req.param('id');

  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.id, sourceId),
        eq(knowledgeSources.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!source) throw new NotFoundError('Knowledge source', sourceId);
  if (!source.storageKey) throw new NotFoundError('File for this source');

  const url = await getFileUrl(source.storageKey);
  return c.json({ url });
});

export default knowledge;
