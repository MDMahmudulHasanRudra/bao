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
import sales from '../../apps/api/src/modules/sales/routes.js';
import { leads, memberships, activities } from '../../apps/api/src/db/schema.js';

type LeadRow = {
  id: string;
  organizationId: string;
  title: string;
  stage: string;
  value: number | null;
  deletedAt: Date | null;
};

function resolved<T>(rows: T[]) {
  return {
    limit: () => Promise.resolve(rows),
    orderBy: () => Promise.resolve(rows),
    returning: () => Promise.resolve(rows),
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

function mockDb(lead: LeadRow | null) {
  const audits: unknown[] = [];
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: object) => ({
        where: () => {
          if (table === memberships) {
            return resolved([{ userId: 'u1', organizationId: 'org-a', role: 'member' }]);
          }
          if (table === leads) return resolved(lead ? [lead] : []);
          return resolved([]);
        },
      }),
    }),
    update: (table: object) => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          if (table === leads && lead) return resolved([{ ...lead, ...patch }]);
          return resolved([]);
        },
      }),
    }),
    insert: () => ({
      values: (row: unknown) => {
        audits.push(row);
        return resolved([row]);
      },
    }),
  } as never);
  return audits;
}

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/sales', sales);
  return app;
}

function authHeaders() {
  const token = signToken({ sub: 'u1', email: 'u@t.com' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-a',
    'content-type': 'application/json',
  };
}

const baseLead: LeadRow = {
  id: 'l1',
  organizationId: 'org-a',
  title: 'Acme renewal',
  stage: 'new',
  value: 10000,
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sales stage transitions (P1-4 e2e extension)', () => {
  it('rejects an invalid transition with a friendly 403 message', async () => {
    mockDb({ ...baseLead, stage: 'new' });
    const app = buildApp();
    const res = await app.request('/sales/leads/l1', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ stage: 'proposal' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/Invalid stage transition: new -> proposal/);
  });

  it('allows a valid transition and audits the update', async () => {
    const audits = mockDb({ ...baseLead, stage: 'new' });
    const app = buildApp();
    const res = await app.request('/sales/leads/l1', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ stage: 'qualified' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lead.stage).toBe('qualified');
    expect(audits.length).toBeGreaterThan(0);
  });

  it('404 when lead belongs to another organization', async () => {
    mockDb(null);
    const app = buildApp();
    const res = await app.request('/sales/leads/other', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ stage: 'qualified' }),
    });
    expect(res.status).toBe(404);
  });

  it('leads list is org-scoped (source contract)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/sales/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/eq\(leads\.organizationId, tenant\.organizationId\)/);
    expect(src).toMatch(/ownerId: tenant\.userId/);
  });
});

describe('activity follow-ups (dueAt + complete)', () => {
  type ActivityRow = {
    id: string;
    organizationId: string;
    subject: string;
    dueAt: Date | null;
    completedAt: Date | null;
  };

  const baseActivity: ActivityRow = {
    id: 'a1',
    organizationId: 'org-a',
    subject: 'Call Acme',
    dueAt: new Date('2026-09-25T10:00:00Z'),
    completedAt: null,
  };

  function mockActivityDb(row: ActivityRow | null) {
    const audits: unknown[] = [];
    vi.mocked(getDb).mockReturnValue({
      select: () => ({
        from: (table: object) => ({
          where: () => {
            if (table === memberships) {
              return resolved([{ userId: 'u1', organizationId: 'org-a', role: 'member' }]);
            }
            if (table === activities) return resolved(row ? [row] : []);
            return resolved([]);
          },
        }),
      }),
      update: (table: object) => ({
        set: (patch: Record<string, unknown>) => ({
          where: () => {
            if (table === activities && row) return resolved([{ ...row, ...patch }]);
            return resolved([]);
          },
        }),
      }),
      insert: () => ({
        values: (r: unknown) => {
          audits.push(r);
          return resolved([r]);
        },
      }),
    } as never);
    return audits;
  }

  it('PATCH marks an activity complete and audits', async () => {
    const audits = mockActivityDb({ ...baseActivity });
    const app = buildApp();
    const res = await app.request('/sales/activities/a1', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity.completedAt).toBeTruthy();
    expect(new Date(body.activity.completedAt).getTime()).toBeGreaterThan(0);
    expect(audits.length).toBeGreaterThan(0);
  });

  it('PATCH 404 for activity outside the org', async () => {
    mockActivityDb(null);
    const app = buildApp();
    const res = await app.request('/sales/activities/other', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ completed: true }),
    });
    expect(res.status).toBe(404);
  });

  it('PATCH accepts dueAt updates (source contract)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/sales/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/sales\.patch\('\/activities\/:id'/);
    expect(src).toMatch(/eq\(activities\.organizationId, tenant\.organizationId\)/);
    expect(src).toMatch(/body\.dueAt \? new Date\(body\.dueAt\) : null/);
  });
});
