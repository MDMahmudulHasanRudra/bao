import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { getDb } from '../../db/index.js';
import { memberships, users, invites, organizations, auditEvents } from '../../db/schema.js';
import { eq, and, count, ilike, gt, isNull } from 'drizzle-orm';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import { notify } from '../notifications/service.js';

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

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export function newInviteToken(): string {
  return randomBytes(24).toString('base64url');
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

accessControl.get('/invites', requirePermission('members.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const pending = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      token: invites.token,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(
      and(
        eq(invites.organizationId, tenant.organizationId),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    );
  return c.json({ invites: pending });
});

accessControl.delete('/invites/:id', requirePermission('members.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, id), eq(invites.organizationId, tenant.organizationId)))
    .limit(1);
  if (!invite) throw new NotFoundError('Invite', id);
  if (invite.acceptedAt) throw new ConflictError('Invite already accepted');
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id));
  await audit(c, 'member.invite_revoke', 'invite', id, { email: invite.email });
  return c.json({ success: true });
});

accessControl.post('/invites/:token/accept', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const token = c.req.param('token');

  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
    throw new NotFoundError('Invite');
  }

  const [me] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, tenant.userId))
    .limit(1);
  if (!me || invite.email.toLowerCase() !== me.email.toLowerCase()) {
    throw new ForbiddenError('This invite was issued to a different email address');
  }

  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, tenant.userId),
        eq(memberships.organizationId, invite.organizationId),
      ),
    )
    .limit(1);
  if (existing) throw new ConflictError('Already a member of this workspace');

  const [membership] = await db
    .insert(memberships)
    .values({
      userId: tenant.userId,
      organizationId: invite.organizationId,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    .returning();

  await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));

  // Audit in the invited org (may differ from current org context).
  try {
    await db.insert(auditEvents).values({
      organizationId: invite.organizationId,
      actorId: tenant.userId,
      action: 'member.invite_accept',
      resourceType: 'membership',
      resourceId: membership.id,
      details: { email: invite.email, role: invite.role },
    });
  } catch {
    // Audit should never fail the request
  }

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);

  return c.json({ membership, organization: org }, 201);
});

accessControl.post('/invite', requirePermission('members.manage'), async (c) => {
  const tenant = getTenant(c);

  const body = await c.req.json<{ email: string; role: string }>();
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@'))
    throw new ValidationError({ email: 'Valid email is required' });
  validateRoleChange(tenant.role as ValidRole, body.role, false);

  const db = getDb();

  const [user] = await db.select().from(users).where(ilike(users.email, email)).limit(1);

  if (user) {
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
      email,
      role: body.role,
    });

    await notify(c, user.id, 'member.invite', `You've been invited as ${body.role}`, {
      body: 'An administrator added you to this workspace.',
      link: '/dashboard',
      metadata: { role: body.role },
    });

    return c.json({ membership }, 201);
  }

  // No user yet — issue a shareable invite link (7 days).
  const [pending] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.organizationId, tenant.organizationId),
        ilike(invites.email, email),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (pending) {
    await audit(c, 'member.invite', 'invite', pending.id, { email, role: pending.role });
    return c.json(
      {
        invite: {
          id: pending.id,
          email: pending.email,
          role: pending.role,
          token: pending.token,
          expiresAt: pending.expiresAt,
        },
        invitePath: `/invite/${pending.token}`,
      },
      201,
    );
  }

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(invites)
    .values({
      organizationId: tenant.organizationId,
      email,
      role: body.role,
      token,
      invitedBy: tenant.userId,
      expiresAt,
    })
    .returning();

  await audit(c, 'member.invite', 'invite', invite.id, { email, role: body.role });

  return c.json(
    {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        expiresAt: invite.expiresAt,
      },
      invitePath: `/invite/${invite.token}`,
    },
    201,
  );
});

accessControl.put('/members/:id/role', requirePermission('members.manage'), async (c) => {
  const tenant = getTenant(c);

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

  await notify(c, targetMembership.userId, 'member.role_change', `Your role is now ${body.role}`, {
    body: `Changed from ${targetMembership.role}.`,
    link: '/dashboard',
    metadata: { role: body.role, previousRole: targetMembership.role },
  });

  return c.json({ membership: updated });
});

accessControl.delete('/members/:id', requirePermission('members.manage'), async (c) => {
  const tenant = getTenant(c);

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
