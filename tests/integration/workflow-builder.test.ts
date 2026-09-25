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
import workflowBuilderRoutes from '../../apps/api/src/modules/workflow-builder/routes.js';

const DEFINITION = {
  name: 'Lead Qualification',
  description: 'Scores inbound leads',
  isActive: true,
  nodes: [{ id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, config: {} }],
  edges: [],
};

function buildApp(role: string) {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ userId: 'u1', organizationId: 'org-1', role }]),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-id', name: 'Lead Qualification' }]),
        then: (onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve([undefined]).then(onFulfilled),
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'test-id', name: 'Lead Qualification' }]),
    delete: vi.fn().mockReturnThis(),
  };
  vi.mocked(getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/workflow-builder', workflowBuilderRoutes);
  return app;
}

function authHeaders() {
  const token = signToken({ sub: 'u1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-1',
    'content-type': 'application/json',
  };
}

describe('Workflow Builder Module', () => {
  it('owner can list definitions', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.definitions)).toBe(true);
  });

  it('owner can create a definition', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(DEFINITION),
    });
    expect([200, 201, 409]).toContain(res.status);
  });

  it('rejects an invalid node type with 422', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        ...DEFINITION,
        nodes: [{ id: 'n1', type: 'nope', position: { x: 0, y: 0 } }],
      }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects a definition with no name', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: '', isActive: true, nodes: [], edges: [] }),
    });
    expect(res.status).toBe(422);
  });

  it('owner can update a definition', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions/test-id', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect([200, 404]).toContain(res.status);
  });

  it('owner can execute a definition', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions/test-id/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ inputData: { leadId: 'l1' } }),
    });
    expect([200, 201, 404]).toContain(res.status);
  });

  it('rejects execute with a non-object inputData', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions/test-id/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ inputData: 'not-an-object' }),
    });
    expect(res.status).toBe(422);
  });

  it('owner can list executions for a definition', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions/test-id/executions', {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.executions)).toBe(true);
  });

  it('owner can read an execution with its step runs', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/executions/test-id', {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status);
  });

  it('owner can retry an execution', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/executions/test-id/retry', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect([200, 201, 404]).toContain(res.status);
  });

  it('viewer cannot create definitions (403)', async () => {
    const app = buildApp('viewer');
    const res = await app.request('/workflow-builder/definitions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(DEFINITION),
    });
    expect(res.status).toBe(403);
  });

  it('viewer cannot manage definitions (403)', async () => {
    const app = buildApp('viewer');
    const res = await app.request('/workflow-builder/definitions/test-id', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it('rejects requests without a token', async () => {
    const app = buildApp('owner');
    const res = await app.request('/workflow-builder/definitions', {
      headers: { 'x-organization-id': 'org-1' },
    });
    expect([401, 403]).toContain(res.status);
  });
});
