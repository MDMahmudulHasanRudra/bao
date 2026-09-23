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
import auditRoutes from '../../apps/api/src/modules/audit/routes.js';
import { redactDetails } from '../../apps/api/src/modules/audit/service.js';
import { auditEvents, memberships } from '../../apps/api/src/db/schema.js';

type Table = object;

function resolved(rows: unknown[]) {
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
  events: Record<string, unknown>[];
};

function mockDb(state: State) {
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: Table) => ({
        where: () => {
          if (table === memberships) return resolved(state.membership ? [state.membership] : []);
          if (table === auditEvents) return resolved(state.events);
          return resolved([]);
        },
      }),
    }),
    insert: () => ({
      values: (row: unknown) => resolved([row]),
    }),
  } as never);
}

function buildApp(role: string, events: Record<string, unknown>[] = []) {
  const state: State = {
    membership: { userId: 'u1', organizationId: 'org-a', role },
    events,
  };
  mockDb(state);
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/audit', auditRoutes);
  return { app, state };
}

function authHeaders(orgId = 'org-a') {
  const token = signToken({ sub: 'u1', email: 'u@t.com' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': orgId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /audit — permission + redaction (P1-6)', () => {
  it('owner can list org audit events', async () => {
    const { app } = buildApp('owner', [
      {
        id: 'e1',
        organizationId: 'org-a',
        action: 'ai.provider.create',
        resourceType: 'ai_provider',
        details: { provider: 'openai' },
        createdAt: new Date().toISOString(),
      },
    ]);
    const res = await app.request('/audit', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].action).toBe('ai.provider.create');
  });

  it('member is denied with 403 audit.read', async () => {
    const { app } = buildApp('member');
    const res = await app.request('/audit', { headers: authHeaders() });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toMatch(/audit\.read/);
  });

  it('redacts secret-like keys and sk- values in details', async () => {
    const { app } = buildApp('owner', [
      {
        id: 'e2',
        organizationId: 'org-a',
        action: 'ai.provider.create',
        resourceType: 'ai_provider',
        details: {
          provider: 'openai',
          apiKey: 'sk-supersecretvalue',
          nested: { token: 'abc', note: 'ok' },
          message: 'used key sk-abcdefghijklmnop with Bearer xyz',
        },
        createdAt: new Date().toISOString(),
      },
    ]);
    const res = await app.request('/audit', { headers: authHeaders() });
    const body = await res.json();
    const details = body.events[0].details as Record<string, unknown>;
    expect(details.provider).toBe('openai');
    expect(details.apiKey).toBe('••••');
    expect((details.nested as Record<string, unknown>).token).toBe('••••');
    expect((details.nested as Record<string, unknown>).note).toBe('ok');
    expect(details.message).toBe('••••');
    expect(JSON.stringify(body)).not.toMatch(/sk-supersecretvalue|sk-abcdefghijklmnop/);
  });

  it('requires auth', async () => {
    const { app } = buildApp('owner');
    const res = await app.request('/audit');
    expect(res.status).toBe(401);
  });
});

describe('redactDetails unit (P1-6)', () => {
  it('masks secret keys and secret-looking values, keeps safe fields', () => {
    const out = redactDetails({
      provider: 'openai',
      encryptedKey: 'enc',
      modelId: 'gpt-4o',
      password: 'hunter2',
      url: 'https://api.example.com?api_key=secret',
      list: [1, 2],
      empty: {},
    });
    expect(out.provider).toBe('openai');
    expect(out.modelId).toBe('gpt-4o');
    expect(out.encryptedKey).toBe('••••');
    expect(out.password).toBe('••••');
    expect(out.url).toBe('••••');
    expect(out.list).toEqual([1, 2]);
    expect(out.empty).toEqual({});
  });

  it('non-object details become empty object', () => {
    expect(redactDetails(null)).toEqual({});
    expect(redactDetails('x')).toEqual({});
    expect(redactDetails([1])).toEqual({});
  });
});

describe('AI run + provider actions present (P1-6)', () => {
  it('assistant routes audit ai.assistant.run', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-assistant/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/audit\(c,\s*'ai\.assistant\.run'/);
  });

  it('ai-settings routes audit provider create/test/rotate/revoke/update + model default', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-settings/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/'ai\.provider\.create'/);
    expect(src).toMatch(/'ai\.provider\.test'/);
    expect(src).toMatch(/'ai\.provider\.rotate'/);
    expect(src).toMatch(/'ai\.provider\.revoke'/);
    expect(src).toMatch(/'ai\.provider\.update'/);
    expect(src).toMatch(/'ai\.model_default\.update'/);
  });

  it('audit write path redacts details before insert', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/audit/service.ts'),
      'utf-8',
    );
    expect(src).toMatch(/details: redactDetails\(/);
    expect(src).toMatch(/SECRET_KEY/);
  });

  it('audit list route is org-scoped and permission-gated', () => {
    const src = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/audit/routes.ts'),
      'utf-8',
    );
    expect(src).toMatch(/requirePermission\('audit\.read'\)/);
    expect(src).toMatch(/eq\(auditEvents\.organizationId,\s*tenant\.organizationId\)/);
    expect(src).toMatch(/redactDetails\(/);
  });
});

describe('Audit log UI contract (P1-6)', () => {
  const pagePath = resolve(__dirname, '../../apps/web/src/app/(workspace)/settings/audit/page.tsx');

  it('page has loading, unauthorized, error+retry, empty, and filter states', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/audit/);
    expect(src).toMatch(/Loading audit log/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/permission to view the audit log/);
    expect(src).toMatch(/No audit events yet/);
    expect(src).toMatch(/No events match this filter/);
    expect(src).toMatch(/secrets are masked/);
  });

  it('shell links to audit log', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx'),
      'utf-8',
    );
    expect(layout).toMatch(/href: '\/settings\/audit'/);
  });
});
