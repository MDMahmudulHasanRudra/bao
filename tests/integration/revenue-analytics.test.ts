import { describe, it, expect, vi } from 'vitest';

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
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import { getDb } from '../../apps/api/src/db/index.js';
import { getDb } from '../../apps/api/src/db/index.js';
import revenueAnalyticsRoutes from '../../apps/api/src/modules/revenue-analytics/routes.js';

function buildApp(role: string) {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    inArray: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 't1', name: 'x' }]),
        then: (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve([undefined]).then(onFulfilled),
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 't1', name: 'x' }]),
    delete: vi.fn().mockReturnThis(),
    desc: vi.fn().mockReturnThis(),
  };
  let firstLimit = true;
  mockDb.limit.mockImplementation(() => {
    if (firstLimit) {
      firstLimit = false;
      return Promise.resolve([{ userId: 'u1', organizationId: 'org-1', role }]);
    }
    return Promise.resolve([]);
  });
  vi.mocked(getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/revenue-analytics', revenueAnalyticsRoutes);
  return app;
}

function authHeaders(_role?: string) {
  const token = signToken({ sub: 'u1', email: 'u@t.com' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-1',
  };
}

describe('Revenue Analytics Module', () => {
  it('owner can get KPIs', async () => {
    const app = buildApp('owner');
    const res = await app.request('/revenue-analytics/kpis', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kpis).toBeDefined();
    expect(Array.isArray(data.kpis)).toBe(true);
    expect(data.kpis.length).toBeGreaterThan(0);
  });

  it('owner can get forecast', async () => {
    const app = buildApp('owner');
    const res = await app.request('/revenue-analytics/kpis', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kpis).toBeDefined();
    expect(Array.isArray(data.kpis)).toBe(true);
    expect(data.kpis.length).toBeGreaterThan(0);
  });

  it('owner can get forecast', async () => {
    const app = buildApp('owner');
    const res = await app.request('/revenue-analytics/forecast', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.forecast).toBeDefined();
    expect(Array.isArray(data.forecast)).toBe(true);
  });

  it('member cannot access forecast (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/revenue-analytics/forecast', {
      headers: authHeaders('member'),
    });
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests return 401 for all endpoints', async () => {
    const app = buildApp('owner');
    for (const endpoint of ['/kpis', '/forecast', '/cohorts', '/churn-analysis']) {
      const res = await app.request(`/revenue-analytics${endpoint}`);
      expect(res.status).toBe(401);
    }
  });
});
