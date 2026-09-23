import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { organizations, memberships } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const orgs = new Hono();

orgs.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const userMemberships = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, tenant.userId));

  return c.json({ organizations: userMemberships });
});

orgs.post('/', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{ name: string; slug: string }>();
  const db = getDb();

  const [org] = await db.insert(organizations).values(body).returning();

  await db.insert(memberships).values({
    userId: tenant.userId,
    organizationId: org.id,
    role: 'owner',
  });

  await audit(c, 'organization.create', 'organization', org.id);

  return c.json({ organization: org }, 201);
});

orgs.get('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const orgId = c.req.param('id');

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.id, tenant.organizationId)))
    .limit(1);

  if (!org) throw new NotFoundError('Organization', orgId);

  return c.json({ organization: org });
});

orgs.put('/:id', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin'].includes(tenant.role)) throw new ForbiddenError('Admin role required');

  const db = getDb();
  const orgId = c.req.param('id');
  const body = await c.req.json<{ name?: string; settings?: Record<string, unknown> }>();

  const [updated] = await db
    .update(organizations)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(organizations.id, orgId), eq(organizations.id, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Organization', orgId);

  await audit(c, 'organization.update', 'organization', orgId);

  return c.json({ organization: updated });
});

export default orgs;
