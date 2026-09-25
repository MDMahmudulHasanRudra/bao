import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db/index.js';
import { users, memberships, organizations, invites } from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { signToken } from '../../core/auth/jwt.js';
import { uploadFile, deleteFile, getFileUrl } from '../../integrations/storage/index.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors/http.js';
import { rateLimit } from '../../core/middleware/rate-limit.js';
import { audit } from '../audit/service.js';
import { uniqueSlug } from '../../db/slug.js';
import { isValidUsername, normalizeUsername } from '../../core/validation/username.js';

const identity = new Hono();

const PROFILE_COLUMNS = {
  id: users.id,
  username: users.username,
  name: users.name,
  avatarUrl: users.avatarUrl,
  jobTitle: users.jobTitle,
  team: users.team,
  phone: users.phone,
  timezone: users.timezone,
  bio: users.bio,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

// ponytail: avatars are stored as the object KEY; getFileUrl is a 1h presigned URL,
// so signing on read keeps a stored URL from silently expiring.
// ponytail: 7d signature; refresh /me after that, or proxy the object through the API.
const AVATAR_TTL = 60 * 60 * 24 * 7;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const OPTIONAL_LIMITS = {
  jobTitle: 120,
  team: 120,
  phone: 40,
  timezone: 64,
} as const;

function liveUser<T extends { avatarUrl: string | null }>(row: T) {
  if (!row.avatarUrl || row.avatarUrl.startsWith('http')) return { ...row, avatarUrl: row.avatarUrl };
  return getFileUrl(row.avatarUrl, AVATAR_TTL).then((avatarUrl) => ({ ...row, avatarUrl }));
}

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedError();
  return userId;
}


identity.post('/register', rateLimit(60000, 10), async (c) => {
  const body = await c.req.json<{
    username: string;
    password: string;
    name: string;
    inviteToken?: string;
    organizationName?: string;
  }>();

  const username = normalizeUsername(body.username);
  const name = (body.name || '').trim();
  if (!isValidUsername(username)) {
    throw new ValidationError({ username: '3-32 characters, letters/digits/._- only' });
  }
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

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing) throw new ConflictError('Username already taken');

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
    if (found.username !== username) {
      throw new ValidationError({ username: 'Username does not match this invite' });
    }
    inviteRow = found;
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, name })
    .returning({ id: users.id, username: users.username, name: users.name });

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

  const token = signToken({ sub: user.id, username: user.username });
  return c.json(
    {
      user: { id: user.id, username: user.username, name: user.name },
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
    username: invite.username,
    role: invite.role,
    organizationName: org?.name ?? 'Workspace',
    expiresAt: invite.expiresAt,
  });
});

identity.post('/login', rateLimit(60000, 20), async (c) => {
  const body = await c.req.json<{ username: string; password: string }>();
  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, normalizeUsername(body.username)), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  const token = signToken({ sub: user.id, username: user.username });

  await audit(c, 'user.login', 'user', user.id);

  return c.json({
    user: { id: user.id, username: user.username, name: user.name },
    token,
  });
});

identity.get('/me', async (c) => {
  const userId = requireUserId(c.get('userId'));

  const db = getDb();
  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) throw new NotFoundError('User');
  const user = await liveUser(row);

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

identity.patch('/me', async (c) => {
  const userId = requireUserId(c.get('userId'));
  const body = await c.req.json<Record<string, string | undefined>>();

  const patch: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const name = (body.name || '').trim();
    if (!name) throw new ValidationError({ name: 'Name is required' });
    if (name.length > 255) throw new ValidationError({ name: 'Name must be 255 characters or fewer' });
    patch.name = name;
  }

  for (const [field, max] of Object.entries(OPTIONAL_LIMITS)) {
    if (body[field] === undefined) continue;
    const value = (body[field] || '').trim();
    if (value.length > max) {
      throw new ValidationError({ [field]: `Must be ${max} characters or fewer` });
    }
    patch[field] = value || null; // empty clears the field; these are all optional
  }

  if (body.bio !== undefined) {
    const bio = (body.bio || '').trim();
    if (bio.length > 2000) throw new ValidationError({ bio: 'Must be 2000 characters or fewer' });
    patch.bio = bio || null;
  }

  if (!Object.keys(patch).length) throw new ValidationError({ profile: 'No fields to update' });

  const db = getDb();
  const [row] = await db
    .update(users)
    .set(patch)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning(PROFILE_COLUMNS);

  if (!row) throw new NotFoundError('User');

  await audit(c, 'user.profile_update', 'user', userId);
  return c.json({ user: await liveUser(row) });
});

identity.post('/me/password', rateLimit(60000, 5), async (c) => {
  const userId = requireUserId(c.get('userId'));
  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();

  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';
  if (newPassword.length < 8) {
    throw new ValidationError({ newPassword: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!user) throw new NotFoundError('User');
  // Always run a compare so a wrong current password is not distinguishable by timing.
  const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentValid) throw new UnauthorizedError('Current password is incorrect');
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw new ValidationError({ newPassword: 'New password must be different' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));

  await audit(c, 'user.password_change', 'user', userId);
  return c.json({ success: true });
});

identity.post('/me/avatar', async (c) => {
  const userId = requireUserId(c.get('userId'));
  const db = getDb();

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) throw new ValidationError({ file: 'Image file is required' });
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new ValidationError({ file: `Unsupported type: ${file.type}. Allowed: PNG, JPEG, WEBP, GIF` });
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new ValidationError({ file: 'Image too large. Max 2MB' });
  }

  const [existing] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!existing) throw new NotFoundError('User');

  // Personal, not tenant-scoped: one user can belong to several orgs.
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `avatars/${userId}/avatar.${ext}`;

  await uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  const previous = existing.avatarUrl;
  if (previous && previous !== key && !previous.startsWith('http')) {
    await deleteFile(previous).catch(() => {});
  }

  await db
    .update(users)
    .set({ avatarUrl: key })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));

  await audit(c, 'user.avatar_update', 'user', userId);
  return c.json({ avatarUrl: await getFileUrl(key, AVATAR_TTL) });
});

export default identity;
