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
  const real = await vi.importActual<typeof import('@bao/config')>('@bao/config');
  return {
    ...real,
    loadEnv: () => real.loadEnv(),
    getEnv: () => real.loadEnv(),
  };
});

const dbModule = await import('../../apps/api/src/db/index.js');
vi.mock('../../apps/api/src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { Hono } from 'hono';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';

function buildProtectedApp(
  membership: { userId: string; organizationId: string; role: string } | null,
) {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(membership ? [membership] : []),
  };
  vi.mocked(dbModule.getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.get('/secret', (c) => {
    const t = c.get('tenant');
    return c.json({ ok: true, organizationId: t.organizationId, role: t.role });
  });
  app.onError(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Full flow — auth + tenancy gate', () => {
  it('rejects request without Authorization header', async () => {
    const app = buildProtectedApp(null);
    const res = await app.request('/secret');
    expect(res.status).toBe(401);
  });

  it('rejects request without x-organization-id header', async () => {
    const app = buildProtectedApp({ userId: 'u1', organizationId: 'org-a', role: 'admin' });
    const token = signToken({ sub: 'u1', email: 'u@x.com' });
    const res = await app.request('/secret', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('rejects user who is not a member of the organization', async () => {
    const app = buildProtectedApp(null);
    const token = signToken({ sub: 'u1', email: 'u@x.com' });
    const res = await app.request('/secret', {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': 'org-b' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/Not a member/);
  });

  it('allows member with valid token and org header', async () => {
    const app = buildProtectedApp({ userId: 'u1', organizationId: 'org-a', role: 'admin' });
    const token = signToken({ sub: 'u1', email: 'u@x.com' });
    const res = await app.request('/secret', {
      headers: { Authorization: `Bearer ${token}`, 'x-organization-id': 'org-a' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.organizationId).toBe('org-a');
    expect(body.role).toBe('admin');
  });

  it('tenant context uses membership role, not a client-supplied header', async () => {
    const app = buildProtectedApp({ userId: 'u1', organizationId: 'org-a', role: 'viewer' });
    const token = signToken({ sub: 'u1', email: 'u@x.com' });
    const res = await app.request('/secret', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-organization-id': 'org-a',
        'x-role': 'owner',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('viewer');
  });
});

describe('Cross-tenant — source contract checks', () => {
  async function readSource(rel: string) {
    const fs = await import('fs');
    const path = await import('path');
    return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
  }

  it('organizations PUT /:id scopes update to path id AND tenant org', async () => {
    const source = await readSource('../../apps/api/src/modules/organizations/routes.ts');
    expect(source).toMatch(
      /orgs\.put\('\/:id'[\s\S]*?eq\(organizations\.id,\s*orgId\),\s*eq\(organizations\.id,\s*tenant\.organizationId\)/,
    );
  });

  it('proposals GET /:id filters by organizationId', async () => {
    const source = await readSource('../../apps/api/src/modules/proposals/routes.ts');
    const getMatch = source.match(/proposalsRouter\.get\('\/:id'[\s\S]*?\}\);/);
    expect(getMatch).toBeTruthy();
    expect(getMatch![0]).toMatch(/eq\(proposals\.organizationId,\s*tenant\.organizationId\)/);
  });

  it('sales PUT /companies/:id filters by organizationId', async () => {
    const source = await readSource('../../apps/api/src/modules/sales/routes.ts');
    const putMatch = source.match(/sales\.put\('\/companies\/:id'[\s\S]*?\}\);/);
    expect(putMatch).toBeTruthy();
    expect(putMatch![0]).toMatch(/eq\(companies\.organizationId,\s*tenant\.organizationId\)/);
  });

  it('knowledge GET /:id filters by organizationId', async () => {
    const source = await readSource('../../apps/api/src/modules/knowledge/routes.ts');
    const getMatch = source.match(/knowledge\.get\('\/:id'[\s\S]*?\}\);/);
    expect(getMatch).toBeTruthy();
    expect(getMatch![0]).toMatch(
      /eq\(knowledgeSources\.organizationId,\s*tenant\.organizationId\)/,
    );
  });
});
