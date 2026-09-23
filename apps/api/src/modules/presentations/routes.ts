import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { presentations } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import {
  createPresentationJob,
  getPresentationStatus,
  type PresentationJob,
} from '../../integrations/presenton/adapter.js';

const presentationsRouter = new Hono();

function mapJobStatus(status: PresentationJob['status']): string {
  if (status === 'completed') return 'ready';
  if (status === 'failed') return 'failed';
  if (status === 'processing') return 'processing';
  return 'pending';
}

const ACTIVE_STATUSES = new Set(['pending', 'processing']);

presentationsRouter.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(presentations)
    .where(eq(presentations.organizationId, tenant.organizationId))
    .orderBy(desc(presentations.createdAt));

  return c.json({ presentations: result });
});

presentationsRouter.post('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    title: string;
    proposalId?: string;
    content?: string;
  }>();

  if (!body.title?.trim()) {
    throw new ValidationError({ title: 'Title is required' });
  }

  const [presentation] = await db
    .insert(presentations)
    .values({
      title: body.title.trim(),
      proposalId: body.proposalId || null,
      organizationId: tenant.organizationId,
      requestedBy: tenant.userId,
      status: 'pending',
      metadata: body.content ? { content: body.content } : {},
    })
    .returning();

  const content = body.content || '';
  let updated = presentation;
  try {
    const job = await createPresentationJob({ title: presentation.title, content });
    const [row] = await db
      .update(presentations)
      .set({
        providerJobId: job.jobId,
        status: mapJobStatus(job.status),
        outputUrl: job.outputUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentation.id))
      .returning();
    updated = row ?? presentation;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Presentation generation failed';
    const [row] = await db
      .update(presentations)
      .set({
        status: 'failed',
        metadata: { ...(presentation.metadata as object), error: message },
        updatedAt: new Date(),
      })
      .where(eq(presentations.id, presentation.id))
      .returning();
    updated = row ?? presentation;
  }

  await audit(c, 'presentation.create', 'presentation', presentation.id);

  return c.json({ presentation: updated }, 201);
});

presentationsRouter.get('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const presentationId = c.req.param('id');

  const [presentation] = await db
    .select()
    .from(presentations)
    .where(
      and(
        eq(presentations.id, presentationId),
        eq(presentations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!presentation) throw new NotFoundError('Presentation', presentationId);

  return c.json({ presentation });
});

presentationsRouter.get('/:id/status', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const presentationId = c.req.param('id');

  const [presentation] = await db
    .select()
    .from(presentations)
    .where(
      and(
        eq(presentations.id, presentationId),
        eq(presentations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!presentation) throw new NotFoundError('Presentation', presentationId);

  let status = presentation.status;
  let outputUrl = presentation.outputUrl;
  let metadata = (presentation.metadata ?? {}) as Record<string, unknown>;

  if (presentation.providerJobId && ACTIVE_STATUSES.has(status)) {
    try {
      const job = await getPresentationStatus(presentation.providerJobId);
      status = mapJobStatus(job.status);
      outputUrl = job.outputUrl || outputUrl;
      if (job.error) metadata = { ...metadata, error: job.error };
      await db
        .update(presentations)
        .set({ status, outputUrl, metadata, updatedAt: new Date() })
        .where(eq(presentations.id, presentation.id));
    } catch (err) {
      status = 'failed';
      metadata = {
        ...metadata,
        error: err instanceof Error ? err.message : 'Status check failed',
      };
      await db
        .update(presentations)
        .set({ status, metadata, updatedAt: new Date() })
        .where(eq(presentations.id, presentation.id));
    }
  } else if (!presentation.providerJobId && status === 'pending') {
    status = 'failed';
    metadata = {
      ...metadata,
      error: 'No Presenton job was recorded for this presentation.',
    };
    await db
      .update(presentations)
      .set({ status, metadata, updatedAt: new Date() })
      .where(eq(presentations.id, presentation.id));
  }

  return c.json({
    status,
    outputUrl,
    error: typeof metadata.error === 'string' ? metadata.error : undefined,
  });
});

export default presentationsRouter;
