import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { leads, knowledgeSources } from '../../db/schema.js';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';
import { ValidationError } from '../../core/errors/http.js';
import { audit } from '../audit/service.js';
import { createComparisonJob } from '../../integrations/diffy/adapter.js';

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

const compareBody = z.object({
  contentA: z.string().min(1).max(20000),
  contentB: z.string().min(1).max(20000),
  type: z.enum(['text', 'code', 'document']).default('text'),
});

// Diffy comparison — audited; mock result when Diffy is not configured
analytics.post('/compare', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = compareBody.safeParse(body);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || 'body'] = issue.message;
    }
    throw new ValidationError(details);
  }

  const result = await createComparisonJob({
    contentA: parsed.data.contentA,
    contentB: parsed.data.contentB,
    type: parsed.data.type,
  });

  const isMock = result.jobId.startsWith('mock-');

  await audit(c, 'diffy.compare', 'analytics_compare', result.jobId, {
    type: parsed.data.type,
    status: result.status,
    score: result.score,
    mock: isMock,
  });

  return c.json({
    comparison: {
      ...result,
      mock: isMock,
      ...(isMock ? { note: 'Diffy not configured — mock comparison' } : {}),
    },
  });
});

export default analytics;
