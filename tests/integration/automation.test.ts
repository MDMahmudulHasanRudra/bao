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
import automationRoutes from '../../apps/api/src/modules/automation/routes.js';

function buildApp(role: string) {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ userId: 'u1', organizationId: 'org-1', role }]),
    orderBy: vi.fn().mockResolvedValue([]),
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
  };
  vi.mocked(getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/automation', automationRoutes);
  return app;
}

function authHeaders(_role?: string) {
  const token = signToken({ sub: 'u1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-1',
  };
}

describe('Automation Module', () => {
  it('owner can list workflows (empty initially)', async () => {
    const app = buildApp('owner');
    const res = await app.request('/automation/workflows', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workflows).toEqual([]);
  });

  it('member cannot create workflow (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/automation/workflows', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test',
        trigger: { type: 'lead_created', config: {} },
        actions: [],
      }),
    });
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests return 401', async () => {
    const app = buildApp('owner');
    const res = await app.request('/automation/workflows');
    expect(res.status).toBe(401);
  });

  it('member cannot run workflow (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/automation/workflows/test-id/run', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerData: {} }),
    });
    expect(res.status).toBe(403);
  });
});
