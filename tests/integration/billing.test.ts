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
import billingRoutes from '../../apps/api/src/modules/billing/routes.js';

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
  app.route('/billing', billingRoutes);
  return app;
}

function authHeaders(_role?: string) {
  const token = signToken({ sub: 'u1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-1',
  };
}

describe('Billing Module', () => {
  it('owner can list plans (empty initially)', async () => {
    const app = buildApp('owner');
    const res = await app.request('/billing/plans', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plans).toEqual([]);
  });

  it('member cannot create plan (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/billing/plans', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', priceCents: 1000, interval: 'month' }),
    });
    expect(res.status).toBe(403);
  });

  it('unauthenticated requests return 401', async () => {
    const app = buildApp('owner');
    const res = await app.request('/billing/plans');
    expect(res.status).toBe(401);
  });

  it('member cannot create subscription (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/billing/subscription', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'test-plan-id' }),
    });
    expect(res.status).toBe(403);
  });

  it('member cannot add payment method (403)', async () => {
    const app = buildApp('member');
    const res = await app.request('/billing/payment-methods', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'card',
        provider: 'stripe',
        providerPaymentMethodId: 'pm_test_123',
        last4: '4242',
        brand: 'Visa',
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('owner can list invoices (empty initially)', async () => {
    const app = buildApp('owner');
    const res = await app.request('/billing/invoices', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invoices).toEqual([]);
  });
});
