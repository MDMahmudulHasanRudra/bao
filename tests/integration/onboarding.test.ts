import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { Hono } from 'hono';
import { getDb } from '../../apps/api/src/db/index.js';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import identity from '../../apps/api/src/modules/identity/routes.js';
import { users, organizations, invites, memberships } from '../../apps/api/src/db/schema.js';

type Table = object;

function resolved<T>(rows: T[]) {
  return {
    limit: () => Promise.resolve(rows),
    orderBy: () => ({ limit: () => Promise.resolve(rows) }),
    returning: () => Promise.resolve(rows),
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

type State = {
  existingUser: Record<string, unknown> | null;
  invite: Record<string, unknown> | null;
  orgSlugTaken: boolean;
  inviteOrgName: string;
  inserts: { table: Table; row: Record<string, unknown> }[];
  inviteUpdates: Record<string, unknown>[];
};

function mockDb(state: State) {
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: Table) => ({
        where: () => {
          if (table === users) return resolved(state.existingUser ? [state.existingUser] : []);
          if (table === invites) return resolved(state.invite ? [state.invite] : []);
          if (table === organizations) {
            if (state.orgSlugTaken) return resolved([{ id: 'org-taken', name: 'Taken' }]);
            if (state.inviteOrgName) return resolved([{ name: state.inviteOrgName }]);
            return resolved([]);
          }
          if (table === memberships) return resolved([]);
          return resolved([]);
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return resolved([{ ...row, id: row.id ?? `gen-${state.inserts.length}` }]);
      },
    }),
    update: (table: Table) => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          if (table === invites) {
            state.inviteUpdates.push(patch);
            return resolved([{ ...(state.invite ?? {}), ...patch }]);
          }
          return resolved([{}]);
        },
      }),
    }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  } as never);
}

function buildIdentityApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/identity', identity);
  return app;
}

function baseState(overrides: Partial<State> = {}): State {
  return {
    existingUser: null,
    invite: null,
    orgSlugTaken: false,
    inviteOrgName: '',
    inserts: [],
    inviteUpdates: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('register — workspace + invite onboarding (completion slice A)', () => {
  it('rejects register with neither inviteToken nor organizationName', async () => {
    const state = baseState();
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'newuser',
        password: 'password123',
        name: 'New User',
      }),
    });
    expect(res.status).toBe(422);
  });

  it('register with organizationName creates user + org + owner membership', async () => {
    const state = baseState();
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'founder',
        password: 'password123',
        name: 'Founder',
        organizationName: 'Acme Labs',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string; orgName: string };
    expect(body.token).toBeTruthy();
    expect(body.orgName).toBe('Acme Labs');

    const userInsert = state.inserts.find((i) => i.table === users);
    const orgInsert = state.inserts.find((i) => i.table === organizations);
    const membershipInserts = state.inserts.filter((i) => i.table === memberships);
    expect(userInsert?.row.username).toBe('founder');
    expect(orgInsert?.row.name).toBe('Acme Labs');
    expect(typeof orgInsert?.row.slug).toBe('string');
    expect(membershipInserts).toHaveLength(1);
    expect(membershipInserts[0]?.row.role).toBe('owner');
  });

  it('register with valid inviteToken joins with invite role and marks invite accepted', async () => {
    const state = baseState({
      invite: {
        id: 'inv-1',
        token: 'tok-abc',
        username: 'invitee',
        role: 'sales',
        organizationId: 'org-1',
        invitedBy: 'u-owner',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      inviteOrgName: 'Inviting Co',
    });
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'invitee',
        password: 'password123',
        name: 'Invitee',
        inviteToken: 'tok-abc',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { orgName: string };
    expect(body.orgName).toBe('Inviting Co');

    const membershipInserts = state.inserts.filter((i) => i.table === memberships);
    expect(membershipInserts).toHaveLength(1);
    expect(membershipInserts[0]?.row.role).toBe('sales');
    expect(state.inviteUpdates[0]).toMatchObject({ acceptedAt: expect.any(Date) });
    expect(state.inserts.find((i) => i.table === organizations)).toBeUndefined();
  });

  it('register with unknown invite token → 404', async () => {
    const state = baseState(); // invite lookup returns []
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'xuser',
        password: 'password123',
        name: 'X',
        inviteToken: 'missing',
      }),
    });
    expect(res.status).toBe(404);
  });

  it('register invite username mismatch → 422', async () => {
    const state = baseState({
      invite: {
        id: 'inv-2',
        token: 'tok-xyz',
        username: 'expected',
        role: 'member',
        organizationId: 'org-1',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'other',
        password: 'password123',
        name: 'Other',
        inviteToken: 'tok-xyz',
      }),
    });
    expect(res.status).toBe(422);
    expect(state.inserts.filter((i) => i.table === users)).toHaveLength(0);
  });

  it('register rejects weak password', async () => {
    const state = baseState();
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'weak',
        password: 'short',
        name: 'Weak',
        organizationName: 'W',
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe('public invite peek (completion slice A)', () => {
  it('returns username/role/org for a valid token', async () => {
    const state = baseState({
      invite: {
        id: 'inv-3',
        token: 'tok-ok',
        username: 'peek',
        role: 'manager',
        organizationId: 'org-1',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      inviteOrgName: 'Peek Org',
    });
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/invites/tok-ok');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { username: string; role: string; organizationName: string };
    expect(body).toMatchObject({
      username: 'peek',
      role: 'manager',
      organizationName: 'Peek Org',
    });
  });

  it('unknown token → 404', async () => {
    mockDb(baseState());
    const app = buildIdentityApp();
    const res = await app.request('/identity/invites/nope');
    expect(res.status).toBe(404);
  });

  it('accepted invite → 404', async () => {
    const state = baseState({
      invite: {
        id: 'inv-4',
        token: 'tok-done',
        username: 'abc',
        role: 'member',
        organizationId: 'org-1',
        acceptedAt: new Date(),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
      inviteOrgName: 'Org',
    });
    mockDb(state);
    const app = buildIdentityApp();
    const res = await app.request('/identity/invites/tok-done');
    expect(res.status).toBe(404);
  });
});

describe('onboarding UI contracts (completion slice A)', () => {
  const web = (p: string) =>
    readFileSync(resolve(__dirname, `../../apps/web/src/app/${p}`), 'utf-8');

  it('register page supports invite + workspace modes', () => {
    const src = web('register/page.tsx');
    expect(src).toMatch(/inviteToken/);
    expect(src).toMatch(/organizationName/);
    expect(src).toMatch(/Create account/);
    expect(src).toMatch(/Join workspace/);
  });

  it('invite page peeks publicly and branches signed-in vs new account', () => {
    const src = web('invite/[token]/page.tsx');
    expect(src).toMatch(/\/api\/v1\/identity\/invites\//);
    expect(src).toMatch(/access-control\/invites\/.*\/accept/);
    expect(src).toMatch(/Create account/);
    expect(src).toMatch(/Accept invite/);
  });

  it('members settings page wires list + invite + role + remove', () => {
    const src = web('(workspace)/settings/members/page.tsx');
    expect(src).toMatch(/access-control\/members/);
    expect(src).toMatch(/access-control\/invite/);
    expect(src).toMatch(/\/role/);
    expect(src).toMatch(/Remove/);
    expect(src).toMatch(/Pending invites/);
    expect(src).toMatch(/Copy link/);
  });

  it('layout exposes Members nav and multi-org switcher', () => {
    // Members is reached through the settings sub-navigation, not a standalone nav row.
    const nav = readFileSync(
      resolve(__dirname, '../../apps/web/src/components/workspace-nav.ts'),
      'utf-8',
    );
    expect(nav).toMatch(/\/settings\/members/);
    const src = web('(workspace)/layout.tsx');
    expect(src).toMatch(/org-switcher/);
    expect(src).toMatch(/switchOrg/);
  });

  it('login page links to register; api lib has register + switchOrg', () => {
    const login = web('login/page.tsx');
    expect(login).toMatch(/\/register/);
    const api = readFileSync(resolve(__dirname, '../../apps/web/src/lib/api.ts'), 'utf-8');
    expect(api).toMatch(/export async function register/);
    expect(api).toMatch(/export function switchOrg/);
    expect(api).toMatch(/bao_memberships/);
  });

  it('schema defines invites and proposal_versions tables', () => {
    const schema = readFileSync(resolve(__dirname, '../../apps/api/src/db/schema.ts'), 'utf-8');
    expect(schema).toMatch(/export const invites = pgTable/);
    expect(schema).toMatch(/export const proposalVersions = pgTable/);
    const migration = readFileSync(
      resolve(__dirname, '../../apps/api/drizzle/0002_curvy_expediter.sql'),
      'utf-8',
    );
    expect(migration).toMatch(/CREATE TABLE.*"invites"/);
    expect(migration).toMatch(/CREATE TABLE.*"proposal_versions"/);
  });
});
