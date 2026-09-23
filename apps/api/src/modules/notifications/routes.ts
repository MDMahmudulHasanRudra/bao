import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { notifications } from '../../db/schema.js';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { getTenant } from '../../core/tenancy/context.js';

const notificationsRouter = new Hono();

notificationsRouter.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, tenant.organizationId),
        eq(notifications.userId, tenant.userId),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const [unreadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, tenant.organizationId),
        eq(notifications.userId, tenant.userId),
        isNull(notifications.readAt),
      ),
    );

  return c.json({ notifications: result, unreadCount: unreadCount.count });
});

notificationsRouter.put('/:id/read', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const notificationId = c.req.param('id');

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, tenant.userId)));

  return c.json({ success: true });
});

notificationsRouter.put('/read-all', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, tenant.organizationId),
        eq(notifications.userId, tenant.userId),
        isNull(notifications.readAt),
      ),
    );

  return c.json({ success: true });
});

export default notificationsRouter;
