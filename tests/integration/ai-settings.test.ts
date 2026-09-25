import { describe, it, expect, vi, afterEach } from 'vitest';

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
import {
  tenantMiddleware,
  requirePermission,
  hasPermission,
} from '../../apps/api/src/core/tenancy/context.js';
import {
  encryptSecret,
  decryptSecret,
  maskKey,
} from '../../apps/api/src/core/security/secret-box.js';
import {
  isModelCompatible,
  modelCapabilities,
  getProviderDef,
} from '../../apps/api/src/integrations/ai-provider/registry.js';
import {
  testConnection,
  generateCompletion,
  AiNotConfiguredError,
} from '../../apps/api/src/integrations/ai-provider/adapter.js';
import aiSettings from '../../apps/api/src/modules/ai-settings/routes.js';
import { aiProviders, aiModelDefaults, memberships } from '../../apps/api/src/db/schema.js';

type Table = object;

function thenable(rows: unknown[]) {
  return {
    limit: () => Promise.resolve(rows),
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

function mockDb(state: { membership: unknown | null; providers: unknown[]; defaults: unknown[] }) {
  vi.mocked(getDb).mockReturnValue({
    select: () => ({
      from: (table: Table) => ({
        where: () => {
          if (table === memberships) return thenable(state.membership ? [state.membership] : []);
          if (table === aiProviders) return thenable(state.providers);
          if (table === aiModelDefaults) return thenable(state.defaults);
          return thenable([]);
        },
      }),
    }),
    insert: () => ({
      values: vi.fn().mockResolvedValue(undefined),
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  } as never);
}

function buildApp(membership: { userId: string; organizationId: string; role: string } | null) {
  mockDb({
    membership,
    providers: [],
    defaults: [],
  });
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/ai-settings', aiSettings);
  app.onError(errorHandler);
  return app;
}

function authHeaders(_role?: string) {
  const token = signToken({ sub: 'user-1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-a',
    'content-type': 'application/json',
  };
}

function appFor(role: string) {
  return buildApp({ userId: 'user-1', organizationId: 'org-a', role });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('secret-box — AES-256-GCM', () => {
  it('round-trips an API key', () => {
    const blob = encryptSecret('sk-or-abc123secret');
    expect(blob.startsWith('v1:')).toBe(true);
    expect(blob).not.toContain('sk-or-abc123secret');
    expect(decryptSecret(blob)).toBe('sk-or-abc123secret');
  });

  it('rejects a tampered ciphertext', () => {
    const blob = encryptSecret('sk-plain-key-value');
    const parts = blob.split(':');
    const data = Buffer.from(parts[3]!, 'base64');
    data[0] = data[0]! ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString('base64')].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects a malformed blob', () => {
    expect(() => decryptSecret('not-a-valid-blob')).toThrow(/Malformed/);
  });

  it('masks keys to a 4-char suffix', () => {
    expect(maskKey('sk-or-secret-key-9999')).toBe('…9999');
    expect(maskKey('short')).toBe('••••');
  });
});

describe('permission matrix', () => {
  it('owner and admin can manage providers; everyone else cannot', () => {
    expect(hasPermission('owner', 'ai.providers.manage')).toBe(true);
    expect(hasPermission('admin', 'ai.providers.manage')).toBe(true);
    expect(hasPermission('manager', 'ai.providers.manage')).toBe(false);
    expect(hasPermission('member', 'ai.providers.manage')).toBe(false);
    expect(hasPermission('viewer', 'ai.providers.manage')).toBe(false);
  });

  it('requirePermission blocks with actionable message', async () => {
    const mw = requirePermission('ai.providers.manage');
    const c = {
      get: (k: string) =>
        k === 'tenant' ? { userId: 'u', organizationId: 'o', role: 'viewer' } : undefined,
    };
    const next = vi.fn();
    await expect(mw(c as never, next)).rejects.toThrow(/Missing permission: ai\.providers\.manage/);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('capability compatibility', () => {
  it('routes embedding models only to embeddings', () => {
    const openai = getProviderDef('openai')!;
    expect(isModelCompatible('text-embedding-3-small', 'embeddings', openai)).toBe(true);
    expect(isModelCompatible('text-embedding-3-small', 'chat_rag', openai)).toBe(false);
    expect(isModelCompatible('gpt-4o-mini', 'chat_rag', openai)).toBe(true);
    expect(isModelCompatible('gpt-4o-mini', 'embeddings', openai)).toBe(false);
  });

  it('providers without embedding support expose no embeddings capability', () => {
    const openrouter = getProviderDef('openrouter')!;
    expect(modelCapabilities('openai/gpt-4o', openrouter)).toContain('chat_rag');
    expect(modelCapabilities('some-embedding-model', openrouter)).toEqual([]);
    expect(isModelCompatible('some-embedding-model', 'embeddings', openrouter)).toBe(false);
  });
});

describe('adapter — provider failure & not-configured', () => {
  it('testConnection reports 401 as key rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const result = await testConnection('openai', 'sk-bad');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unauthorized/i);
  });

  it('testConnection reports network failure without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const result = await testConnection('openai', 'sk-bad');
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('sk-bad');
  });

  it('generateCompletion without org config returns a safe actionable message', async () => {
    const result = await generateCompletion('sys', 'hello', undefined, undefined);
    expect(result.metadata.errorCategory).toBe('not_configured');
    expect(result.content).toMatch(/Settings → AI Providers/);
    expect(typeof result.content).toBe('string');
  });

  it('generateCompletion with unconfigured org never calls fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await generateCompletion('sys', 'hello', undefined, 'org-unconfigured');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.metadata.errorCategory).toBe('not_configured');
  });

  it('exports AiNotConfiguredError for embeddings callers to catch', () => {
    expect(new AiNotConfiguredError()).toBeInstanceOf(Error);
  });
});

describe('AI Settings routes — permission gate & masking', () => {
  it('rejects viewer with 403 and permission name', async () => {
    const app = appFor('viewer');
    const res = await app.request('/ai-settings', { headers: authHeaders('viewer') });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/ai\.providers\.manage/);
  });

  it('allows admin to list settings (masked, no encryptedKey)', async () => {
    const app = appFor('admin');
    const res = await app.request('/ai-settings', { headers: authHeaders('admin') });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: unknown[];
      defaults: unknown[];
      catalogue: { id: string }[];
      capabilities: string[];
    };
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.capabilities).toContain('chat_rag');
    expect(body.catalogue.some((c) => c.id === 'openrouter')).toBe(true);
    expect(JSON.stringify(body)).not.toContain('encryptedKey');
    expect(JSON.stringify(body)).not.toContain('encrypted_key');
  });

  it('never returns the encrypted key even when a provider row exists', async () => {
    const membership = { userId: 'user-1', organizationId: 'org-a', role: 'owner' };
    mockDb({
      membership,
      providers: [
        {
          id: 'p1',
          organizationId: 'org-a',
          provider: 'openai',
          label: 'OpenAI',
          baseUrl: null,
          encryptedKey: 'v1:SECRETCIPHERDATA',
          keySuffix: '9999',
          status: 'active',
          lastTestedAt: null,
          lastTestResult: null,
          lastTestError: null,
          createdBy: 'user-1',
          updatedBy: 'user-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      defaults: [],
    });
    const app = new Hono();
    app.use('*', authMiddleware());
    app.use('*', tenantMiddleware());
    app.route('/ai-settings', aiSettings);
    app.onError(errorHandler);

    const res = await app.request('/ai-settings', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('SECRETCIPHERDATA');
    expect(text).not.toContain('encryptedKey');
    expect(text).toContain('9999');
  });

  it('rejects unknown provider on create', async () => {
    const app = appFor('owner');
    const res = await app.request('/ai-settings', {
      method: 'POST',
      headers: authHeaders('owner'),
      body: JSON.stringify({ provider: 'evilcorp', apiKey: 'sk-12345678' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error: { message: string; details?: unknown } };
    expect(JSON.stringify(body.error)).toMatch(/provider/i);
  });

  it('rejects short API keys', async () => {
    const app = appFor('owner');
    const res = await app.request('/ai-settings', {
      method: 'POST',
      headers: authHeaders('owner'),
      body: JSON.stringify({ provider: 'openai', apiKey: 'short' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('requires HTTPS base URL for openai-compatible provider', async () => {
    const app = appFor('owner');
    const res = await app.request('/ai-settings', {
      method: 'POST',
      headers: authHeaders('owner'),
      body: JSON.stringify({
        provider: 'openai-compatible',
        apiKey: 'sk-12345678',
        baseUrl: 'http://insecure.example.com/v1',
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error: { message: string; details?: unknown } };
    expect(JSON.stringify(body.error)).toMatch(/HTTPS/i);
  });

  it('rejects incompatible model for a capability on PUT /defaults', async () => {
    const membership = { userId: 'user-1', organizationId: 'org-a', role: 'owner' };
    mockDb({
      membership,
      providers: [
        {
          id: 'p1',
          organizationId: 'org-a',
          provider: 'openai',
          status: 'active',
          encryptedKey: 'v1:x',
          keySuffix: '9999',
        },
      ],
      defaults: [],
    });
    const app = new Hono();
    app.use('*', authMiddleware());
    app.use('*', tenantMiddleware());
    app.route('/ai-settings', aiSettings);
    app.onError(errorHandler);

    const res = await app.request('/ai-settings/defaults', {
      method: 'PUT',
      headers: authHeaders('owner'),
      body: JSON.stringify({
        capability: 'chat_rag',
        provider: 'openai',
        modelId: 'text-embedding-3-small',
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error: { message: string; details?: unknown } };
    expect(JSON.stringify(body.error)).toMatch(/not compatible/i);
  });
});

describe('AI Settings routes — source contract (tenant scope)', () => {
  async function readSource() {
    const fs = await import('fs');
    const path = await import('path');
    return fs.readFileSync(
      path.resolve(__dirname, '../../apps/api/src/modules/ai-settings/routes.ts'),
      'utf-8',
    );
  }

  it('applies the manage permission to every route', async () => {
    const source = await readSource();
    expect(source).toMatch(/aiSettings\.use\('\*',\s*MANAGE\)/);
    expect(source).toMatch(/requirePermission\('ai\.providers\.manage'\)/);
  });

  it('every ai_providers / ai_model_defaults query is scoped to the tenant org', async () => {
    const source = await readSource();
    const scoped =
      source.match(
        /eq\(ai(Providers|ModelDefaults)\.organizationId,\s*tenant\.organizationId\)/g,
      ) ?? [];
    // select + insert + delete paths across providers and defaults
    expect(scoped.length).toBeGreaterThanOrEqual(8);
    // no query references these tables by org without the tenant guard nearby
    const unguarded = source.match(
      /\.from\(ai(Providers|ModelDefaults)\)[\s\S]{0,160}?(?=\.where)/g,
    );
    for (const block of unguarded ?? []) {
      expect(block).not.toMatch(/eq\(ai(Providers|ModelDefaults)\.organizationId,\s*org/);
    }
  });

  it('maskProvider never includes encryptedKey', async () => {
    const source = await readSource();
    const maskMatch = source.match(/function maskProvider[\s\S]*?\n\}/);
    expect(maskMatch).toBeTruthy();
    expect(maskMatch![0]).not.toMatch(/encryptedKey:\s*row/);
    expect(maskMatch![0]).toMatch(/encryptedKey intentionally omitted/);
  });
});
