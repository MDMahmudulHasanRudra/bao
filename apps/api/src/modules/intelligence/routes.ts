import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { monitoringTargets, intelligenceEvents } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import { createScrapeJob } from '../../integrations/scraplink/adapter.js';

const intelligence = new Hono();
const TARGETS = requirePermission('intelligence.targets.manage');

// ============================================================
// Monitoring Targets
// ============================================================

intelligence.get('/targets', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(monitoringTargets)
    .where(eq(monitoringTargets.organizationId, tenant.organizationId))
    .orderBy(desc(monitoringTargets.createdAt));

  return c.json({ targets: result });
});

intelligence.post('/targets', TARGETS, async (c) => {
  const tenant = getTenant(c);

  const db = getDb();
  const body = await c.req.json<{
    name: string;
    type: string;
    config: Record<string, unknown>;
    policy?: Record<string, unknown>;
  }>();

  if (!body.name?.trim()) {
    throw new ValidationError({ name: 'Name is required' });
  }

  const [target] = await db
    .insert(monitoringTargets)
    .values({
      ...body,
      name: body.name.trim(),
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
    })
    .returning();

  await audit(c, 'intelligence.target.create', 'monitoring_target', target.id);

  return c.json({ target }, 201);
});

intelligence.put('/targets/:id', TARGETS, async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const targetId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
  }>();

  const [updated] = await db
    .update(monitoringTargets)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(
        eq(monitoringTargets.id, targetId),
        eq(monitoringTargets.organizationId, tenant.organizationId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError('Monitoring target', targetId);

  await audit(c, 'intelligence.target.update', 'monitoring_target', targetId);

  return c.json({ target: updated });
});

intelligence.delete('/targets/:id', TARGETS, async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const targetId = c.req.param('id');

  const [deleted] = await db
    .delete(monitoringTargets)
    .where(
      and(
        eq(monitoringTargets.id, targetId),
        eq(monitoringTargets.organizationId, tenant.organizationId),
      ),
    )
    .returning();

  if (!deleted) throw new NotFoundError('Monitoring target', targetId);

  await audit(c, 'intelligence.target.delete', 'monitoring_target', targetId);

  return c.json({ success: true });
});

// Manual scrape cycle — uses ScrapLink adapter (mock result when unconfigured)
intelligence.post('/targets/:id/scrape', TARGETS, async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const targetId = c.req.param('id');
  const body = await c.req
    .json<{ url?: string }>()
    .catch(() => ({ url: undefined as string | undefined }));

  const [target] = await db
    .select()
    .from(monitoringTargets)
    .where(
      and(
        eq(monitoringTargets.id, targetId),
        eq(monitoringTargets.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!target) throw new NotFoundError('Monitoring target', targetId);

  const configUrl = (target.config as { url?: string } | null)?.url;
  const url = body.url || configUrl;
  if (!url?.trim()) {
    throw new ValidationError({ url: 'URL is required (body.url or target config.url)' });
  }

  const result = await createScrapeJob({ url: url.trim(), metadata: { targetId } });

  if (result.status === 'failed') {
    throw new ValidationError({ scrape: result.error || 'Scrape failed' });
  }

  const isMock = result.jobId.startsWith('mock-');
  const [event] = await db
    .insert(intelligenceEvents)
    .values({
      organizationId: tenant.organizationId,
      targetId: target.id,
      title: `Scrape: ${new URL(url.trim(), 'https://placeholder.local').hostname || url}`,
      content: result.content || null,
      sourceUrl: url.trim(),
      classification: 'scrape',
      reviewed: false,
      metadata: {
        jobId: result.jobId,
        status: result.status,
        mock: isMock,
        ...(isMock ? { note: 'ScrapLink not configured — mock result' } : {}),
      },
    })
    .returning();

  await audit(c, 'intelligence.scrape', 'intelligence_event', event.id, {
    targetId: target.id,
    jobId: result.jobId,
    mock: isMock,
  });

  return c.json({ event, mock: isMock }, 201);
});

// ============================================================
// Intelligence Events
// ============================================================

intelligence.get('/events', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const targetId = c.req.query('targetId');
  const reviewed = c.req.query('reviewed');

  const conditions = [eq(intelligenceEvents.organizationId, tenant.organizationId)];
  if (targetId) conditions.push(eq(intelligenceEvents.targetId, targetId));
  if (reviewed !== undefined) conditions.push(eq(intelligenceEvents.reviewed, reviewed === 'true'));

  const result = await db
    .select()
    .from(intelligenceEvents)
    .where(and(...conditions))
    .orderBy(desc(intelligenceEvents.createdAt));

  return c.json({ events: result });
});

intelligence.put('/events/:id/review', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const eventId = c.req.param('id');

  const [updated] = await db
    .update(intelligenceEvents)
    .set({ reviewed: true })
    .where(
      and(
        eq(intelligenceEvents.id, eventId),
        eq(intelligenceEvents.organizationId, tenant.organizationId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError('Intelligence event', eventId);

  await audit(c, 'intelligence.event.review', 'intelligence_event', eventId);

  return c.json({ event: updated });
});

export default intelligence;
