import type { Context, Next } from 'hono';
import { UnauthorizedError, ForbiddenError } from '../errors/http.js';

export interface TenantContext {
  userId: string;
  organizationId: string;
  role: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    tenant: TenantContext;
    userId: string;
  }
}

export function tenantMiddleware() {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId');
    if (!userId) throw new UnauthorizedError('Authentication required');

    const organizationId = c.req.header('x-organization-id');
    if (!organizationId) throw new ForbiddenError('Organization context required');

    const { getDb } = await import('../../db/index.js');
    const db = getDb();
    const { memberships } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
      .limit(1);

    if (!membership) throw new ForbiddenError('Not a member of this organization');

    c.set('tenant', {
      userId,
      organizationId,
      role: membership.role,
    });

    await next();
  };
}

export function requireRole(...allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const tenant = c.get('tenant');
    if (!tenant) throw new UnauthorizedError('Tenant context required');
    if (!allowedRoles.includes(tenant.role)) {
      throw new ForbiddenError(`Required role: ${allowedRoles.join(' or ')}`);
    }
    await next();
  };
}

export function getTenant(c: Context): TenantContext {
  const tenant = c.get('tenant');
  if (!tenant) throw new UnauthorizedError('Tenant context required');
  return tenant;
}
