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
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import accessControl from '../../apps/api/src/modules/access-control/routes.js';
import proposals from '../../apps/api/src/modules/proposals/routes.js';
import notificationsRoutes from '../../apps/api/src/modules/notifications/routes.js';
import {
  memberships,
  users,
  proposals as proposalsTable,
  notifications,
} from '../../apps/api/src/db/schema.js';

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
  membership: { userId: string; organizationId: string; role: string } | null;
  inviteUser: Record<string, unknown> | null;
  existingMembership: Record<string, unknown> | null;
  proposal: Record<string, unknown> | null;
  notificationRows: Record<string, unknown>[];
  unreadCount: number;
  inserts: { table: Table; row: Record<string, unknown> }[];
};

function mockDbOrdered(state: State) {
  let membershipSelects = 0;
  vi.mocked(getDb).mockReturnValue({
    select: (projection?: Record<string, unknown>) => ({
      from: (table: Table) => ({
        where: () => {
          if (table === memberships) {
            membershipSelects += 1;
            if (membershipSelects === 1) {
              return resolved(state.membership ? [state.membership] : []);
            }
            return resolved(state.existingMembership ? [state.existingMembership] : []);
          }
          if (table === users) return resolved(state.inviteUser ? [state.inviteUser] : []);
          if (table === proposalsTable) {
            return resolved(state.proposal ? [state.proposal] : []);
          }
          if (table === notifications) {
            if (projection && 'count' in projection) {
              return resolved([{ count: state.unreadCount }]);
            }
            return resolved(state.notificationRows);
          }
          if (projection && 'count' in projection) return resolved([{ count: 0 }]);
          return resolved([]);
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return resolved([row]);
      },
    }),
    update: (table: Table) => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          if (table === proposalsTable && state.proposal) {
            return resolved([{ ...state.proposal, ...patch }]);
          }
          if (table === notifications) return resolved([{}]);
          return resolved([{}]);
        },
      }),
    }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  } as never);
}

function buildApp(router: unknown, path: string) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route(path, router as never);
  return app;
}

function authHeaders(roleHeader?: string) {
  const token = signToken({ sub: 'u1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-a',
    'content-type': 'application/json',
    ...(roleHeader ? { 'x-role': roleHeader } : {}),
  };
}

function baseState(overrides: Partial<State> = {}): State {
  return {
    membership: { userId: 'u1', organizationId: 'org-a', role: 'owner' },
    inviteUser: null,
    existingMembership: null,
    proposal: null,
    notificationRows: [],
    unreadCount: 0,
    inserts: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notification producers emit org+user scoped rows (P1-5)', () => {
  it('member invite notifies the invited user', async () => {
    const state = baseState({
      inviteUser: { id: 'u2', username: 'new', name: 'New' },
    });
    mockDbOrdered(state);
    const app = buildApp(accessControl, '/access-control');
    const res = await app.request('/access-control/invite', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ username: 'new', role: 'member' }),
    });
    expect(res.status).toBe(201);
    const notif = state.inserts.find((i) => i.table === notifications);
    expect(notif).toBeDefined();
    expect(notif!.row.userId).toBe('u2');
    expect(notif!.row.organizationId).toBe('org-a');
    expect(notif!.row.type).toBe('member.invite');
    expect(JSON.stringify(notif!.row)).not.toMatch(/sk-|password|api[_-]?key/i);
  });

  it('role change notifies the target member', async () => {
    const state = baseState({
      membership: { userId: 'u1', organizationId: 'org-a', role: 'owner' },
    });
    // membership select #1 = tenant, #2 = target membership lookup
    let membershipSelects = 0;
    vi.mocked(getDb).mockReturnValue({
      select: (projection?: Record<string, unknown>) => ({
        from: (table: Table) => ({
          where: () => {
            if (table === memberships) {
              membershipSelects += 1;
              if (membershipSelects === 1) {
                return resolved([{ userId: 'u1', organizationId: 'org-a', role: 'owner' }]);
              }
              return resolved([
                { id: 'm2', userId: 'u2', organizationId: 'org-a', role: 'member' },
              ]);
            }
            if (projection && 'count' in projection) return resolved([{ count: 0 }]);
            return resolved([]);
          },
        }),
      }),
      insert: (table: Table) => ({
        values: (row: Record<string, unknown>) => {
          state.inserts.push({ table, row });
          return resolved([row]);
        },
      }),
      update: (table: Table) => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => {
            if (table === memberships) {
              return resolved([
                { id: 'm2', userId: 'u2', organizationId: 'org-a', role: patch.role },
              ]);
            }
            return resolved([{}]);
          },
        }),
      }),
      delete: () => ({ where: () => Promise.resolve(undefined) }),
    } as never);

    const app = buildApp(accessControl, '/access-control');
    const res = await app.request('/access-control/members/m2/role', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role: 'manager' }),
    });
    expect(res.status).toBe(200);
    const notif = state.inserts.find((i) => i.table === notifications);
    expect(notif).toBeDefined();
    expect(notif!.row.userId).toBe('u2');
    expect(notif!.row.type).toBe('member.role_change');
    expect(notif!.row.organizationId).toBe('org-a');
  });

  it('proposal approval notifies the creator with no secret content', async () => {
    const state = baseState({
      proposal: {
        id: 'p1',
        organizationId: 'org-a',
        title: 'Acme proposal',
        createdBy: 'u2',
        status: 'draft',
      },
    });
    mockDbOrdered(state);
    const app = buildApp(proposals, '/proposals');
    const res = await app.request('/proposals/p1/approve', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const notif = state.inserts.find((i) => i.table === notifications);
    expect(notif).toBeDefined();
    expect(notif!.row.userId).toBe('u2');
    expect(notif!.row.type).toBe('proposal.approve');
    expect(notif!.row.organizationId).toBe('org-a');
    expect(JSON.stringify(notif!.row)).not.toMatch(/sk-|password|api[_-]?key/i);
  });

  it('assistant reply emitter is wired in routes (source contract)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-assistant/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/notify\(c,\s*conversation\.userId,\s*'assistant\.reply'/);
  });

  it('worker knowledge.ready emitter inserts via raw SQL (source contract)', () => {
    const src = readFileSync(resolve(__dirname, '../../apps/worker/src/ingest.ts'), 'utf-8');
    expect(src).toMatch(/notifyReady\(/);
    expect(src).toMatch(/'knowledge\.ready'/);
    expect(src).toMatch(/INSERT INTO notifications/);
    expect(src).toMatch(/uploaded_by/);
  });
});

describe('inbox read API (P1-5)', () => {
  it('GET /notifications returns list + unreadCount scoped to org+user', async () => {
    const state = baseState({
      notificationRows: [
        {
          id: 'n1',
          organizationId: 'org-a',
          userId: 'u1',
          type: 'member.invite',
          title: 'You have been invited',
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    mockDbOrdered(state);
    const app = buildApp(notificationsRoutes, '/notifications');
    const res = await app.request('/notifications', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toHaveLength(1);
    expect(body.unreadCount).toBe(1);
    expect(body.notifications[0].type).toBe('member.invite');
  });

  it('PUT /read-all marks unread notifications read', async () => {
    const state = baseState();
    mockDbOrdered(state);
    const app = buildApp(notificationsRoutes, '/notifications');
    const res = await app.request('/notifications/read-all', {
      method: 'PUT',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('notifications routes remain org+user scoped (source contract)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/notifications/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/eq\(notifications\.organizationId,\s*tenant\.organizationId\)/);
    expect(src).toMatch(/eq\(notifications\.userId,\s*tenant\.userId\)/);
    expect(src).toMatch(/isNull\(notifications\.readAt\)/);
  });
});
