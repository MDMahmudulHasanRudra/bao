import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidUsername, normalizeUsername } from '../../apps/api/src/core/validation/username.js';

vi.mock('@bao/config', async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters!';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  process.env.AI_API_KEY = 'test';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || 'test-encryption-key-at-least-32-chars!!';
  const real = await vi.importActual<typeof import('@bao/config')>('@bao/config');
  return {
    ...real,
    loadEnv: () => real.loadEnv(),
    getEnv: () => real.loadEnv(),
  };
});

vi.mock('../../apps/api/src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock('../../apps/api/src/integrations/storage/index.js', () => ({
  uploadFile: vi.fn().mockResolvedValue('avatars/u1/avatar.png'),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getFileUrl: vi.fn(async (key: string) => `https://storage.test/${key}?sig=x`),
}));

import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import identity from '../../apps/api/src/modules/identity/routes.js';
import { audit } from '../../apps/api/src/modules/audit/service.js';
import { getDb } from '../../apps/api/src/db/index.js';
import { uploadFile } from '../../apps/api/src/integrations/storage/index.js';

vi.mock('../../apps/api/src/modules/audit/service.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

const HASH_A = bcrypt.hashSync('current-password-1', 4);

type Row = Record<string, unknown>;

let rows: Row[] = [];
let updateSets: Record<string, unknown>[] = [];

function mockDb() {
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateSets.push(values);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () => rows),
            then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          })),
        };
      }),
    })),
  };
  vi.mocked(getDb).mockReturnValue(db as never);
  return db;
}

// Mirrors main.ts: the exact path AND the wildcard both get authMiddleware.
function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('/api/v1/identity/me', authMiddleware());
  app.use('/api/v1/identity/me/*', authMiddleware());
  app.route('/api/v1/identity', identity);
  return app;
}

function authHeaders(sub = 'u1') {
    return { Authorization: `Bearer ${signToken({ sub, username: String(sub) })}` };
}

beforeEach(() => {
  rows = [];
  updateSets = [];
  vi.mocked(uploadFile).mockClear();
  vi.mocked(audit).mockClear();
  mockDb();
});

describe('identity profile: auth boundary', () => {
  it('rejects an unauthenticated GET /me', async () => {
    const res = await buildApp().request('http://x/api/v1/identity/me');
    expect(res.status).toBe(401);
  });

  // Regression: Hono `use` without a wildcard does not match sub-paths, so these
  // three were reachable with no Authorization header before the fix.
  it.each([
    ['PATCH', '/api/v1/identity/me'],
    ['POST', '/api/v1/identity/me/password'],
    ['POST', '/api/v1/identity/me/avatar'],
  ])('rejects unauthenticated %s %s', async (method, path) => {
    const res = await buildApp().request(`http://x${path}`, { method });
    expect(res.status).toBe(401);
  });

  it('does not leak that a sub-route exists to an anonymous caller', async () => {
    const res = await buildApp().request('http://x/api/v1/identity/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'yyyyyyyy' }),
    });
    expect(res.status).toBe(401);
  });

  // The app under test wires its own copy of these, so assert the real wiring too:
  // dropping the wildcard line in main.ts is exactly how the sub-routes became public.
  it('main.ts registers auth for the /me wildcard path', () => {
    const src = readFileSync(resolve('apps/api/src/main.ts'), 'utf-8');
    expect(src).toMatch(/app\.use\('\/api\/v1\/identity\/me\/\*',\s*authMiddleware\(\)\)/);
  });

  // 0006 moved auth off email. users.email still exists (rollback safety), so the
  // only thing stopping it creeping back into login is an explicit assertion.
  it('auth never reads users.email or invites.email', () => {
    for (const f of [
      'apps/api/src/modules/identity/routes.ts',
      'apps/api/src/modules/access-control/routes.ts',
      'apps/api/src/core/auth/jwt.ts',
    ]) {
      const src = readFileSync(resolve(f), 'utf-8');
      // \b so the deprecated users.emailVerifiedAt column does not trip the guard.
      expect(src, f).not.toMatch(/users\.email\b|invites\.email\b/);
    }
  });

  it('login and registration validate the username rules', () => {
    expect(isValidUsername('admin')).toBe(true);
    expect(isValidUsername('j.doe-1_x')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(33))).toBe(false);
    expect(isValidUsername('has@at.com')).toBe(false);
    expect(isValidUsername('.leading')).toBe(false);
    // Input is normalized, so 'Admin' is accepted and stored as 'admin'.
    expect(isValidUsername('Admin')).toBe(true);
    expect(normalizeUsername('  Admin  ')).toBe('admin');
  });
});

describe('identity profile: PATCH /me', () => {
  it('updates name and optional fields', async () => {
    rows = [
      {
        id: 'u1',
        username: 'u1',
        name: 'Ada L',
        avatarUrl: null,
        jobTitle: 'Head of Sales',
        team: 'Revenue',
        phone: null,
        timezone: null,
        bio: null,
      },
    ];

    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Lovelace', jobTitle: 'VP Revenue' }),
    });

    expect(res.status).toBe(200);
    expect(updateSets[0]).toMatchObject({ name: 'Ada Lovelace', jobTitle: 'VP Revenue' });
    expect(vi.mocked(audit).mock.calls[0][1]).toBe('user.profile_update');
  });

  it('treats an empty optional field as clearing it', async () => {
    rows = [{ id: 'u1', username: 'u1', name: 'Ada', avatarUrl: null }];

    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ team: '   ' }),
    });

    expect(res.status).toBe(200);
    expect(updateSets[0]).toMatchObject({ team: null });
  });

  it('rejects a blank name', async () => {
    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.name).toBeTruthy();
    expect(updateSets).toHaveLength(0);
  });

  it('rejects an over-long optional field', async () => {
    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobTitle: 'x'.repeat(121) }),
    });

    expect(res.status).toBe(422);
    expect(updateSets).toHaveLength(0);
  });

  it('rejects an empty patch', async () => {
    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(422);
    expect(updateSets).toHaveLength(0);
  });

  it('never returns a soft-deleted user', async () => {
    rows = [];
    const res = await buildApp().request('http://x/api/v1/identity/me', {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ghost' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('identity profile: POST /me/password', () => {
  function seedUser() {
    rows = [{ id: 'u1', passwordHash: HASH_A }];
  }

  it('changes the password with the correct current one', async () => {
    seedUser();
    const res = await buildApp().request('http://x/api/v1/identity/me/password', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'current-password-1', newPassword: 'brand-new-pass' }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(audit).mock.calls[0][1]).toBe('user.password_change');
    const stored = updateSets[0].passwordHash as string;
    expect(stored).not.toBe(HASH_A);
    expect(await bcrypt.compare('brand-new-pass', stored)).toBe(true);
  });

  it('rejects a wrong current password and does not write', async () => {
    seedUser();
    const res = await buildApp().request('http://x/api/v1/identity/me/password', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: 'brand-new-pass' }),
    });

    expect(res.status).toBe(401);
    expect(updateSets).toHaveLength(0);
  });

  it('rejects a short new password', async () => {
    seedUser();
    const res = await buildApp().request('http://x/api/v1/identity/me/password', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'current-password-1', newPassword: 'short' }),
    });

    expect(res.status).toBe(422);
    expect(updateSets).toHaveLength(0);
  });

  it('rejects reusing the same password', async () => {
    seedUser();
    const res = await buildApp().request('http://x/api/v1/identity/me/password', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'current-password-1',
        newPassword: 'current-password-1',
      }),
    });

    expect(res.status).toBe(422);
    expect(updateSets).toHaveLength(0);
  });
});

describe('identity profile: POST /me/avatar', () => {
  it('stores the object key, not the signed URL', async () => {
    rows = [{ id: 'u1', avatarUrl: null }];
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }));

    const res = await buildApp().request('http://x/api/v1/identity/me/avatar', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(uploadFile).mock.calls[0][0]).toBe('avatars/u1/avatar.png');
    // The DB keeps the key so it cannot silently expire; the response signs it.
    expect(updateSets[0].avatarUrl).toBe('avatars/u1/avatar.png');
    const body = await res.json();
    expect(body.avatarUrl).toContain('avatars/u1/avatar.png');
  });

  it('rejects a non-image upload', async () => {
    rows = [{ id: 'u1', avatarUrl: null }];
    const form = new FormData();
    form.append('file', new File(['x'], 'a.exe', { type: 'application/x-msdownload' }));

    const res = await buildApp().request('http://x/api/v1/identity/me/avatar', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });

    expect(res.status).toBe(422);
    expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
  });

  it('rejects a request with no file', async () => {
    rows = [{ id: 'u1', avatarUrl: null }];
    const res = await buildApp().request('http://x/api/v1/identity/me/avatar', {
      method: 'POST',
      headers: authHeaders(),
      body: new FormData(),
    });

    expect(res.status).toBe(422);
  });
});
