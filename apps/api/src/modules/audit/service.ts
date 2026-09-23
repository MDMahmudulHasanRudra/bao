import type { Context } from 'hono';
import { getDb } from '../../db/index.js';
import { auditEvents } from '../../db/schema.js';
import { getTenant } from '../../core/tenancy/context.js';

export async function audit(
  c: Context,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>,
) {
  try {
    const tenant = getTenant(c);
    const db = getDb();
    await db.insert(auditEvents).values({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      action,
      resourceType,
      resourceId: resourceId || undefined,
      details: details || {},
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });
  } catch {
    // Audit should never fail the request
  }
}
