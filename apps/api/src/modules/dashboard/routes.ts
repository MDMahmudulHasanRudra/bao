import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import {
  leads,
  activities,
  knowledgeSources,
  aiConversations,
  notifications,
} from '../../db/schema.js';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';

const dashboard = new Hono();

dashboard.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

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

  // Recent activities
  const recentActivities = await db
    .select()
    .from(activities)
    .where(eq(activities.organizationId, tenant.organizationId))
    .orderBy(desc(activities.createdAt))
    .limit(5);

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
    knowledgeStats: {
      totalSources: knowledgeStats.totalSources,
      readySources: knowledgeStats.readySources,
    },
    aiConversationsCount: aiStats.count,
    unreadNotifications: notifStats.count,
  });
});

export default dashboard;
