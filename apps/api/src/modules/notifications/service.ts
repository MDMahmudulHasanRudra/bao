import type { Context } from 'hono';
import { getDb } from '../../db/index.js';
import { notifications } from '../../db/schema.js';
import { getTenant } from '../../core/tenancy/context.js';

export type NotifyOptions = {
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
};

export async function notifyRaw(
  organizationId: string,
  userId: string,
  type: string,
  title: string,
  options: NotifyOptions = {},
) {
  try {
    const db = getDb();
    await db.insert(notifications).values({
      organizationId,
      userId,
      type,
      title,
      body: options.body ?? null,
      link: options.link ?? null,
      metadata: options.metadata ?? {},
    });
  } catch {
    // Notification should never fail the request
  }
}

export async function notify(
  c: Context,
  userId: string,
  type: string,
  title: string,
  options: NotifyOptions = {},
) {
  const tenant = getTenant(c);
  await notifyRaw(tenant.organizationId, userId, type, title, options);
}
