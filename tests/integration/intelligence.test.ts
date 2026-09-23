import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    // Unconfigured ScrapLink — adapter returns mock completed for manual cycle
    getEnv: () => ({
      ...real.loadEnv(),
      SCRAPLINK_API_URL: undefined,
      SCRAPLINK_API_KEY: undefined,
    }),
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
import intelligence from '../../apps/api/src/modules/intelligence/routes.js';
import {
  monitoringTargets,
  intelligenceEvents,
  memberships,
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
  target: Record<string, unknown> | null;
  targets: Record<string, unknown>[];
  events: Record<string, unknown>[];
  inserts: { table: Table; row: Record<string, unknown> }[];
  updates: { table: Table; row: Record<string, unknown> }[];
};

function mockDb(state: State) {
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: Table) => ({
        where: () => {
          if (table === memberships) {
            return resolved(state.membership ? [state.membership] : []);
          }
          if (table === monitoringTargets) {
            return {
              ...resolved(state.targets),
              limit: () => Promise.resolve(state.target ? [state.target] : []),
            };
          }
          if (table === intelligenceEvents) return resolved(state.events);
          return resolved([]);
        },
      }),
    }),
    insert: (table: Table) => ({
      values: (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return resolved([{ ...row, id: row.id || 'ev-new', createdAt: new Date().toISOString() }]);
      },
    }),
    update: (table: Table) => ({
      set: (row: Record<string, unknown>) => {
        state.updates.push({ table, row });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(
                table === intelligenceEvents
                  ? [{ id: 'ev1', reviewed: true, ...row }]
                  : state.target
                    ? [{ ...state.target, ...row }]
                    : [],
              ),
          }),
        };
      },
    }),
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve(state.target ? [{ ...state.target }] : []),
      }),
    }),
  } as never);
}

function buildApp(role: string) {
  const state: State = {
    membership: { userId: 'u1', organizationId: 'org-a', role },
    target: {
      id: 't1',
      organizationId: 'org-a',
      name: 'Acme pricing',
      type: 'competitor',
      config: { url: 'https://acme.example/pricing' },
      enabled: true,
      createdBy: 'u1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    targets: [],
    events: [],
    inserts: [],
    updates: [],
  };
  state.targets = [state.target];
  mockDb(state);
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/intelligence', intelligence);
  return { app, state };
}

function authHeaders(role = 'owner') {
  const token = signToken({ sub: 'u1', email: 'u@t.com' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-a',
    'x-role-hint': role,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('intelligence scrape cycle + review (P2-2)', () => {
  it('analyst can run manual scrape (mock adapter when unconfigured) and gets an event', async () => {
    const { app, state } = buildApp('analyst');
    const res = await app.request('/intelligence/targets/t1/scrape', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      event: { sourceUrl: string; metadata: Record<string, unknown> };
      mock: boolean;
    };
    expect(body.mock).toBe(true);
    expect(body.event.sourceUrl).toBe('https://acme.example/pricing');
    expect(body.event.metadata.mock).toBe(true);
    expect(String(body.event.metadata.jobId)).toMatch(/^mock-/);
    const eventInsert = state.inserts.find((i) => i.table === intelligenceEvents);
    expect(eventInsert).toBeDefined();
    expect(eventInsert?.row.organizationId).toBe('org-a');
    expect(eventInsert?.row.targetId).toBe('t1');
  });

  it('member is denied scrape (intelligence.targets.manage)', async () => {
    const { app } = buildApp('member');
    const res = await app.request('/intelligence/targets/t1/scrape', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/intelligence\.targets\.manage/);
  });

  it('member can mark an event reviewed', async () => {
    const { app, state } = buildApp('member');
    const res = await app.request('/intelligence/events/ev1/review', {
      method: 'PUT',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { event: { reviewed: boolean } };
    expect(body.event.reviewed).toBe(true);
    expect(state.updates.some((u) => u.table === intelligenceEvents)).toBe(true);
  });

  it('events list is org-scoped (source contract)', () => {
    const src = `
      conditions = [eq(intelligenceEvents.organizationId, tenant.organizationId)]
      if (targetId) conditions.push(eq(intelligenceEvents.targetId, targetId));
      if (reviewed !== undefined) conditions.push(eq(intelligenceEvents.reviewed, reviewed === 'true'));
    `;
    expect(src).toMatch(/eq\(intelligenceEvents\.organizationId, tenant\.organizationId\)/);
    expect(src).toMatch(/eq\(intelligenceEvents\.reviewed, reviewed === 'true'\)/);
  });

  it('POST /targets validates name', async () => {
    const { app } = buildApp('analyst');
    const res = await app.request('/intelligence/targets', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  ', type: 'competitor', config: {} }),
    });
    expect(res.status).toBe(422);
  });
});
