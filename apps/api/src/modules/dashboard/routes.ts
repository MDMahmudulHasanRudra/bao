import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import {
  leads,
  activities,
  knowledgeSources,
  aiConversations,
  notifications,
} from '../../db/schema.js';
import { eq, and, sql, desc, isNull, isNotNull, lte, gte } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';

const dashboard = new Hono();

function parseRange(range?: string): { from: Date; to: Date; days: number } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  let days = 30;
  switch (range) {
    case '7d':
      days = 7;
      break;
    case '30d':
      days = 30;
      break;
    case '90d':
      days = 90;
      break;
    default:
      days = 30;
  }
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, days };
}

// Main dashboard endpoint (enhanced with range support)
dashboard.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const range = c.req.query('range') || '30d';
  const { from, to, days } = parseRange(range);

  // Pipeline summary
  const pipeline = await db
    .select({
      stage: leads.stage,
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${leads.value}), 0)::int`,
    })
    .from(leads)
    .where(and(eq(leads.organizationId, tenant.organizationId), isNull(leads.deletedAt)))
    .groupBy(leads.stage);

  // Recent activities (filtered by range)
  const recentActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, tenant.organizationId),
        gte(activities.createdAt, from),
        lte(activities.createdAt, to),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(5);

  // Upcoming follow-ups
  const horizon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const upcomingActivities = await db
    .select({
      id: activities.id,
      type: activities.type,
      subject: activities.subject,
      dueAt: activities.dueAt,
      leadId: activities.leadId,
    })
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, tenant.organizationId),
        isNull(activities.completedAt),
        isNotNull(activities.dueAt),
        lte(activities.dueAt, horizon),
      ),
    )
    .orderBy(activities.dueAt)
    .limit(10);

  // Knowledge stats
  const [knowledgeStats] = await db
    .select({
      totalSources: sql<number>`count(*)::int`,
      readySources: sql<number>`count(*) filter (where status = 'ready')::int`,
    })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.organizationId, tenant.organizationId),
        isNull(knowledgeSources.deletedAt),
      ),
    );

  // AI conversations count
  const [aiStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiConversations)
    .where(eq(aiConversations.organizationId, tenant.organizationId));

  // Unread notifications
  const [notifStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, tenant.organizationId),
        eq(notifications.userId, tenant.userId),
        isNull(notifications.readAt),
      ),
    );

  return c.json({
    pipeline,
    recentActivities,
    upcomingActivities,
    knowledgeStats: {
      totalSources: knowledgeStats.totalSources,
      readySources: knowledgeStats.readySources,
    },
    aiConversationsCount: aiStats.count,
    unreadNotifications: notifStats.count,
    range: { from: from.toISOString(), to: to.toISOString(), days },
  });
});

// Trends endpoint for charts - daily metrics over time range
dashboard.get('/trends', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const range = c.req.query('range') || '30d';
  const { from, to, days } = parseRange(range);

  // Daily leads created
  const dailyLeads = await db
    .select({
      date: sql<string>`date(${leads.createdAt})`,
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${leads.value}), 0)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, tenant.organizationId),
        isNull(leads.deletedAt),
        gte(leads.createdAt, from),
        lte(leads.createdAt, to),
      ),
    )
    .groupBy(sql`date(${leads.createdAt})`)
    .orderBy(sql`date(${leads.createdAt})`);

  // Daily won leads
  const dailyWon = await db
    .select({
      date: sql<string>`date(${leads.createdAt})`,
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${leads.value}), 0)::int`,
    })
    .from(leads)
    .where(
      and(
        eq(leads.organizationId, tenant.organizationId),
        isNull(leads.deletedAt),
        eq(leads.stage, 'closed_won'),
        gte(leads.createdAt, from),
        lte(leads.createdAt, to),
      ),
    )
    .groupBy(sql`date(${leads.createdAt})`)
    .orderBy(sql`date(${leads.createdAt})`);

  // Daily activities
  const dailyActivities = await db
    .select({
      date: sql<string>`date(${activities.createdAt})`,
      count: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.organizationId, tenant.organizationId),
        gte(activities.createdAt, from),
        lte(activities.createdAt, to),
      ),
    )
    .groupBy(sql`date(${activities.createdAt})`)
    .orderBy(sql`date(${activities.createdAt})`);

  // Daily knowledge sources
  const dailyKnowledge = await db
    .select({
      date: sql<string>`date(${knowledgeSources.createdAt})`,
      totalSources: sql<number>`count(*)::int`,
      readySources: sql<number>`count(*) filter (where status = 'ready')::int`,
    })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.organizationId, tenant.organizationId),
        isNull(knowledgeSources.deletedAt),
        gte(knowledgeSources.createdAt, from),
        lte(knowledgeSources.createdAt, to),
      ),
    )
    .groupBy(sql`date(${knowledgeSources.createdAt})`)
    .orderBy(sql`date(${knowledgeSources.createdAt})`);

  // Daily AI conversations
  const dailyAI = await db
    .select({
      date: sql<string>`date(${aiConversations.createdAt})`,
      count: sql<number>`count(*)::int`,
    })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.organizationId, tenant.organizationId),
        gte(aiConversations.createdAt, from),
        lte(aiConversations.createdAt, to),
      ),
    )
    .groupBy(sql`date(${aiConversations.createdAt})`)
    .orderBy(sql`date(${aiConversations.createdAt})`);

  // Build complete daily series (fill missing dates with zeros)
  const dailyMap = new Map<
    string,
    {
      date: string;
      leads: number;
      won: number;
      wonValue: number;
      activities: number;
      knowledge: number;
      readyKnowledge: number;
      aiChats: number;
    }
  >();

  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    dailyMap.set(key, {
      date: key,
      leads: 0,
      won: 0,
      wonValue: 0,
      activities: 0,
      knowledge: 0,
      readyKnowledge: 0,
      aiChats: 0,
    });
  }

  dailyLeads.forEach((r) => {
    const entry = dailyMap.get(r.date);
    if (entry) {
      entry.leads = r.count;
      entry.wonValue = r.totalValue;
    }
  });
  dailyWon.forEach((r) => {
    const entry = dailyMap.get(r.date);
    if (entry) {
      entry.won = r.count;
    }
  });
  dailyActivities.forEach((r) => {
    const entry = dailyMap.get(r.date);
    if (entry) entry.activities = r.count;
  });
  dailyKnowledge.forEach((r) => {
    const entry = dailyMap.get(r.date);
    if (entry) {
      entry.knowledge = r.totalSources;
      entry.readyKnowledge = r.readySources;
    }
  });
  dailyAI.forEach((r) => {
    const entry = dailyMap.get(r.date);
    if (entry) entry.aiChats = r.count;
  });

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return c.json({ daily, range: { from: from.toISOString(), to: to.toISOString(), days } });
});

// Funnel endpoint - stage conversion rates
dashboard.get('/funnel', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const stageOrder = ['new', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  const stageLabels: Record<string, string> = {
    new: 'New',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Closed Won',
    closed_lost: 'Closed Lost',
  };

  // Get all leads with stage, value, and createdAt
  const allLeads = await db
    .select({
      stage: leads.stage,
      value: leads.value,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.organizationId, tenant.organizationId), isNull(leads.deletedAt)));

  // Calculate counts and values per stage
  const stageMap = new Map<string, { count: number; totalValue: number; avgDays: number }>();
  stageOrder.forEach((s) => stageMap.set(s, { count: 0, totalValue: 0, avgDays: 0 }));

  allLeads.forEach((lead) => {
    const existing = stageMap.get(lead.stage) || { count: 0, totalValue: 0, avgDays: 0 };
    existing.count += 1;
    existing.totalValue += lead.value || 0;
    stageMap.set(lead.stage, existing);
  });

  // Calculate conversion rates (stage-to-stage)
  const stages = stageOrder.map((stage, index) => {
    const data = stageMap.get(stage)!;
    const prevStage = index > 0 ? stageOrder[index - 1] : null;
    const prevCount = prevStage ? stageMap.get(prevStage)!.count : data.count;
    const conversionRate = prevCount > 0 ? Math.round((data.count / prevCount) * 100) : 100;

    // Calculate avg days in stage (simplified - would need stage history for accurate)
    return {
      stage,
      label: stageLabels[stage] || stage,
      count: data.count,
      totalValue: data.totalValue,
      conversionRate,
      avgDays: index > 0 ? Math.max(1, Math.round(30 / stageOrder.length)) : 0,
    };
  });

  // Overall funnel metrics
  const totalLeads = allLeads.length;
  const wonLeads = allLeads.filter((l) => l.stage === 'closed_won').length;
  const totalWonValue = allLeads
    .filter((l) => l.stage === 'closed_won')
    .reduce((s, l) => s + (l.value || 0), 0);
  const overallConversion = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  return c.json({
    stages,
    summary: {
      totalLeads,
      wonLeads,
      totalWonValue,
      overallConversion,
    },
  });
});

export default dashboard;
