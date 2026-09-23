import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { leads, knowledgeSources } from '../../db/schema.js';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';

const analytics = new Hono();

analytics.get('/sales', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const [stats] = await db
    .select({
      totalLeads: sql<number>`count(*)::int`,
      wonLeads: sql<number>`count(*) filter (where stage = 'closed_won')::int`,
      lostLeads: sql<number>`count(*) filter (where stage = 'closed_lost')::int`,
      totalValue: sql<number>`coalesce(sum(value) filter (where stage = 'closed_won'), 0)::int`,
      avgValue: sql<number>`coalesce(avg(value) filter (where stage != 'closed_lost'), 0)::int`,
    })
    .from(leads)
    .where(and(eq(leads.organizationId, tenant.organizationId), isNull(leads.deletedAt)));

  const conversionRate = stats.totalLeads > 0 ? (stats.wonLeads / stats.totalLeads) * 100 : 0;

  return c.json({
    stats: {
      ...stats,
      conversionRate: Math.round(conversionRate * 100) / 100,
    },
  });
});

analytics.get('/knowledge', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const [stats] = await db
    .select({
      totalSources: sql<number>`count(*)::int`,
      readySources: sql<number>`count(*) filter (where status = 'ready')::int`,
      totalChunks: sql<number>`coalesce(sum(chunk_count), 0)::int`,
    })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.organizationId, tenant.organizationId),
        isNull(knowledgeSources.deletedAt),
      ),
    );

  return c.json({ stats });
});

export default analytics;
