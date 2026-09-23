import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { auditEvents } from '../../db/schema.js';
import { eq, and, desc, like } from 'drizzle-orm';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { redactDetails } from './service.js';

const auditRouter = new Hono();

auditRouter.get('/', requirePermission('audit.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const actionFilter = c.req.query('action');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

  const conditions = [eq(auditEvents.organizationId, tenant.organizationId)];
  if (actionFilter) {
    conditions.push(like(auditEvents.action, `${actionFilter}%`));
  }

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return c.json({
    events: rows.map((row) => ({
      ...row,
      details: redactDetails(row.details),
    })),
  });
});

export default auditRouter;
