import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb } from '../../db/index.js';
import { users, memberships, organizations } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { signToken } from '../../core/auth/jwt.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../core/errors/http.js';
import { rateLimit } from '../../core/middleware/rate-limit.js';
import { audit } from '../audit/service.js';

const identity = new Hono();

identity.post('/register', rateLimit(60000, 10), async (c) => {
  const body = await c.req.json<{ email: string; password: string; name: string }>();
  const db = getDb();

  const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await bcrypt.hash(body.password, 12);
  const [user] = await db
    .insert(users)
    .values({ email: body.email, passwordHash, name: body.name })
    .returning({ id: users.id, email: users.email, name: users.name });

  const token = signToken({ sub: user.id, email: user.email });
  return c.json({ user: { id: user.id, email: user.email, name: user.name }, token }, 201);
});

identity.post('/login', rateLimit(60000, 20), async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
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
