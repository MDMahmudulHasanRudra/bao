import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { organizations, memberships } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { uniqueSlug } from '../../db/slug.js';
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
  const body = await c.req.json<{ name: string; slug?: string }>();
  const name = (body.name || '').trim();
  if (!name) throw new ValidationError({ name: 'Workspace name is required' });
  const db = getDb();

  const slug = await uniqueSlug(db, body.slug?.trim() || name);
  if (body.slug) {
    const [taken] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, body.slug))
      .limit(1);
    if (taken) throw new ConflictError('Workspace URL already in use');
  }

  const [org] = await db.insert(organizations).values({ name, slug }).returning();

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

orgs.put('/:id', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const orgId = c.req.param('id');
  const body = await c.req.json<{ name?: string; settings?: Record<string, unknown> }>();

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ValidationError({ name: 'Name cannot be empty' });
    patch.name = name;
  }
  if (body.settings !== undefined && body.settings !== null) {
    if (typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      throw new ValidationError({ settings: 'Settings must be an object' });
    }
    patch.settings = body.settings;
  }
  patch.updatedAt = new Date();

  const [updated] = await db
    .update(organizations)
    .set(patch)
    .where(and(eq(organizations.id, orgId), eq(organizations.id, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Organization', orgId);

  await audit(c, 'organization.update', 'organization', orgId);

  return c.json({ organization: updated });
});

export default orgs;
