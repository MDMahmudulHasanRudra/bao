import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db/index.js';
import { users, memberships, organizations, invites } from '../../db/schema.js';
import { eq, ilike } from 'drizzle-orm';
import { signToken } from '../../core/auth/jwt.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors/http.js';
import { rateLimit } from '../../core/middleware/rate-limit.js';
import { audit } from '../audit/service.js';
import { uniqueSlug } from '../../db/slug.js';

const identity = new Hono();

identity.post('/register', rateLimit(60000, 10), async (c) => {
  const body = await c.req.json<{
    email: string;
    password: string;
    name: string;
    inviteToken?: string;
    organizationName?: string;
  }>();

  const email = (body.email || '').trim().toLowerCase();
  const name = (body.name || '').trim();
  if (!email || !email.includes('@')) throw new ValidationError({ email: 'Valid email required' });
  if (!name) throw new ValidationError({ name: 'Name is required' });
  if (!body.password || body.password.length < 8) {
    throw new ValidationError({ password: 'Password must be at least 8 characters' });
  }
  if (!body.inviteToken && !body.organizationName?.trim()) {
    throw new ValidationError({
      inviteToken: 'Provide an invite token or a workspace name',
    });
  }

  const db = getDb();

  const [existing] = await db.select().from(users).where(ilike(users.email, email)).limit(1);
  if (existing) throw new ConflictError('Email already registered');

  let inviteRow: typeof invites.$inferSelect | undefined;
  if (body.inviteToken) {
    const [found] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, body.inviteToken))
      .limit(1);
    if (!found || found.acceptedAt || found.revokedAt || found.expiresAt < new Date()) {
      throw new NotFoundError('Invite');
    }
    if (found.email.toLowerCase() !== email) {
      throw new ValidationError({ email: 'Email does not match this invite' });
    }
    inviteRow = found;
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .returning({ id: users.id, email: users.email, name: users.name });

  let organizationId: string;
  let orgName: string;

  if (inviteRow) {
    organizationId = inviteRow.organizationId;
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    orgName = org?.name ?? 'Workspace';

    await db.insert(memberships).values({
      userId: user.id,
      organizationId,
      role: inviteRow.role,
      invitedBy: inviteRow.invitedBy,
    });
    await db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, inviteRow.id));
  } else {
    const orgNameInput = body.organizationName!.trim();
    const slug = await uniqueSlug(db, orgNameInput);
    const [org] = await db.insert(organizations).values({ name: orgNameInput, slug }).returning();
    organizationId = org.id;
    orgName = org.name;
    await db.insert(memberships).values({
      userId: user.id,
      organizationId,
      role: 'owner',
    });
  }

  const token = signToken({ sub: user.id, email: user.email });
  return c.json(
    {
      user: { id: user.id, email: user.email, name: user.name },
      token,
      organizationId,
      orgName,
    },
    201,
  );
});

// Public: peek at an invite before signing in / registering.
identity.get('/invites/:token', rateLimit(60000, 30), async (c) => {
  const token = c.req.param('token');
  if (!token) throw new NotFoundError('Invite');
  const db = getDb();
  const [invite] = await db.select().from(invites).where(eq(invites.token, token)).limit(1);
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) {
    throw new NotFoundError('Invite');
  }
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, invite.organizationId))
    .limit(1);
  return c.json({
    email: invite.email,
    role: invite.role,
    organizationName: org?.name ?? 'Workspace',
    expiresAt: invite.expiresAt,
  });
});

identity.post('/login', rateLimit(60000, 20), async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(ilike(users.email, (body.email || '').trim()))
    .limit(1);
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const token = signToken({ sub: user.id, email: user.email });

  await audit(c, 'user.login', 'user', user.id);

  return c.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

identity.get('/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) throw new UnauthorizedError();

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new NotFoundError('User');

  const userMemberships = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      organizationId: memberships.organizationId,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId));

  return c.json({ user, memberships: userMemberships });
});

export default identity;
