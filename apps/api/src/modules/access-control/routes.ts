import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { memberships, users } from '../../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ConflictError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const VALID_ROLES = [
  'owner',
  'admin',
  'manager',
  'sales',
  'contributor',
  'analyst',
  'member',
  'viewer',
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_HIERARCHY: Record<ValidRole, number> = {
  owner: 8,
  admin: 7,
  manager: 6,
  sales: 5,
  contributor: 4,
  analyst: 3,
  member: 2,
  viewer: 1,
};

export function validateRoleChange(
  requesterRole: ValidRole,
  targetRole: string,
  isSelfChange: boolean,
): void {
  if (!VALID_ROLES.includes(targetRole as ValidRole)) {
    throw new ForbiddenError(`Invalid role: ${targetRole}. Valid roles: ${VALID_ROLES.join(', ')}`);
  }
  const targetRoleTyped = targetRole as ValidRole;
  if (ROLE_HIERARCHY[targetRoleTyped] > ROLE_HIERARCHY[requesterRole]) {
    throw new ForbiddenError('Cannot assign a role higher than your own');
  }
  if (
    ROLE_HIERARCHY[targetRoleTyped] === ROLE_HIERARCHY[requesterRole] &&
    requesterRole !== 'owner'
  ) {
    throw new ForbiddenError('Cannot assign a role equal to your own');
  }
  if (isSelfChange) {
    throw new ForbiddenError('Cannot change your own role');
  }
}

const accessControl = new Hono();

accessControl.get('/members', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const members = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, tenant.organizationId));

  return c.json({ members });
});

accessControl.post('/invite', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin'].includes(tenant.role)) throw new ForbiddenError('Admin role required');

  const body = await c.req.json<{ email: string; role: string }>();
  validateRoleChange(tenant.role as ValidRole, body.role, false);

  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (!user) throw new NotFoundError('User with this email');

  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.userId, user.id), eq(memberships.organizationId, tenant.organizationId)),
    )
    .limit(1);

  if (existing) throw new ConflictError('User already a member');

  const [membership] = await db
    .insert(memberships)
    .values({
      userId: user.id,
      organizationId: tenant.organizationId,
      role: body.role,
      invitedBy: tenant.userId,
    })
    .returning();

  await audit(c, 'member.invite', 'membership', membership.id, {
    email: body.email,
    role: body.role,
  });

  return c.json({ membership }, 201);
});

accessControl.put('/members/:id/role', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin'].includes(tenant.role)) throw new ForbiddenError('Admin role required');

  const db = getDb();
  const memberId = c.req.param('id');
  const body = await c.req.json<{ role: string }>();

  const [targetMembership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, memberId), eq(memberships.organizationId, tenant.organizationId)))
    .limit(1);

  if (!targetMembership) throw new NotFoundError('Membership', memberId);

  const isSelfChange = targetMembership.userId === tenant.userId;
  validateRoleChange(tenant.role as ValidRole, body.role, isSelfChange);

  const [updated] = await db
    .update(memberships)
    .set({ role: body.role })
    .where(eq(memberships.id, memberId))
    .returning();

  await audit(c, 'member.role_change', 'membership', memberId, {
    role: body.role,
    previousRole: targetMembership.role,
  });

  return c.json({ membership: updated });
});

accessControl.delete('/members/:id', async (c) => {
  const tenant = getTenant(c);
  if (!['owner', 'admin'].includes(tenant.role)) throw new ForbiddenError('Admin role required');

  const db = getDb();
  const memberId = c.req.param('id');

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, memberId), eq(memberships.organizationId, tenant.organizationId)))
    .limit(1);

  if (!membership) throw new NotFoundError('Membership', memberId);
  if (membership.role === 'owner') throw new ForbiddenError('Cannot remove organization owner');
  if (membership.userId === tenant.userId) throw new ForbiddenError('Cannot remove yourself');

  const [ownerCount] = await db
    .select({ count: count() })
    .from(memberships)
    .where(
      and(eq(memberships.organizationId, tenant.organizationId), eq(memberships.role, 'owner')),
    );

  if (ownerCount.count <= 1 && membership.role === 'owner') {
    throw new ForbiddenError('Cannot remove the last owner');
  }

  await db.delete(memberships).where(eq(memberships.id, memberId));

  await audit(c, 'member.remove', 'membership', memberId);

  return c.json({ success: true });
});

export default accessControl;
