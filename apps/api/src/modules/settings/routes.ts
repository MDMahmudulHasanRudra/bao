import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { organizations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const settings = new Hono();

settings.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, tenant.organizationId))
    .limit(1);

  if (!org) throw new NotFoundError('Organization');

  return c.json({ settings: org.settings || {} });
});

settings.put('/', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin'].includes(tenant.role)) {
    throw new ForbiddenError('Admin role required');
  }

  const db = getDb();
  const body = await c.req.json<{ settings: Record<string, unknown> }>();

  const [updated] = await db
    .update(organizations)
    .set({ settings: body.settings, updatedAt: new Date() })
    .where(eq(organizations.id, tenant.organizationId))
    .returning();

  if (!updated) throw new NotFoundError('Organization');

  await audit(c, 'settings.update', 'organization', tenant.organizationId);

  return c.json({ settings: updated.settings });
});

export default settings;
