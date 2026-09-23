import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { monitoringTargets, intelligenceEvents } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const intelligence = new Hono();

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

intelligence.post('/targets', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin', 'analyst'].includes(tenant.role)) {
    throw new ForbiddenError('Analyst role required');
  }

  const db = getDb();
  const body = await c.req.json<{
    name: string;
    type: string;
    config: Record<string, unknown>;
    policy?: Record<string, unknown>;
  }>();

  const [target] = await db
    .insert(monitoringTargets)
    .values({
      ...body,
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
    })
    .returning();

  await audit(c, 'intelligence.target.create', 'monitoring_target', target.id);

  return c.json({ target }, 201);
});

intelligence.put('/targets/:id', async (c) => {
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

intelligence.delete('/targets/:id', async (c) => {
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
