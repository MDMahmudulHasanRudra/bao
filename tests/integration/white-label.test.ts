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
    getEnv: () => real.loadEnv(),
  };
});

vi.mock('../../apps/api/src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}));

// Branding assets go to MinIO in production; keep the tests off the network.
vi.mock('../../apps/api/src/integrations/storage/index.js', () => ({
  uploadFile: vi.fn().mockResolvedValue('etag'),
  getFileUrl: vi.fn(async (key: string) => `https://minio.test/${key}?sig=abc`),
  downloadFile: vi.fn().mockResolvedValue(Buffer.from('x')),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  buildTenantKey: vi.fn((orgId: string, ...parts: string[]) => [orgId, ...parts].join('/')),
}));

import { Hono } from 'hono';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { signToken, authMiddleware } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import { getDb } from '../../apps/api/src/db/index.js';
import { memberships } from '../../apps/api/src/db/schema.js';
import whiteLabelRoutes, {
  publicBrandingRouter,
  resolveHost,
} from '../../apps/api/src/modules/white-label/routes.js';

type Row = Record<string, unknown>;

const BRANDING_ROW: Row = {
  id: 'wl-1',
  organizationId: 'org-1',
  productName: 'Acme Cloud',
  tagline: 'Ship faster',
  logoKey: 'org-1/white-label/logo.png',
  faviconKey: null,
  loginBackgroundKey: null,
  primaryColor: '#ff0000',
  secondaryColor: '#00ff00',
  fontFamily: 'inter',
  customDomain: 'app.acme.com',
  emailFromName: 'Acme',
  emailReplyTo: 'support@acme.com',
  termsUrl: 'https://acme.com/terms',
  privacyUrl: 'https://acme.com/privacy',
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * tenantMiddleware and the white-label routes both use select().from().where().limit(),
 * so `from` records which table is being read and `limit` answers accordingly.
 *
 * When `taken` is supplied the mock also models the "is this domain already
 * claimed?" query that runs on save: the first white-label select is the org's own
 * row, the second is whoever owns the domain.
 */
function buildProtectedApp(role: string, existing: Row | null = null, taken: Row | null = null) {
  let table: unknown;
  let whiteLabelSelects = 0;
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function (this: unknown, t: unknown) {
      table = t;
      return this;
    }),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      if (table === memberships) {
        return [{ userId: 'u1', organizationId: 'org-1', role }];
      }
      if (taken) {
        whiteLabelSelects += 1;
        return whiteLabelSelects === 1 ? (existing ? [existing] : []) : [taken];
      }
      return existing ? [existing] : [];
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([BRANDING_ROW]),
      }),
    }),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([BRANDING_ROW]),
  };
  vi.mocked(getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/settings/white-label', whiteLabelRoutes);
  return app;
}

/**
 * The public endpoint issues two queries: the customDomain lookup, then the branding read.
 * `from` records the table and `limit` answers the first call with the match and the second
 * with the full row.
 */
function buildPublicApp(row: Row | null) {
  let calls = 0;
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      calls += 1;
      if (!row) return [];
      return calls === 1 ? [{ organizationId: row.organizationId }] : [row];
    }),
  };
  vi.mocked(getDb).mockReturnValue(mockDb as never);

  const app = new Hono();
  app.onError(errorHandler);
  app.route('/api/v1', publicBrandingRouter);
  return app;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${signToken({ sub: 'u1', username: 'u' })}`,
    'x-organization-id': 'org-1',
  };
}

function put(body: unknown) {
  return {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

beforeEach(() => {
  vi.mocked(getDb).mockReset();
});

describe('White Label — settings', () => {
  it('returns null settings and empty assets before anything is configured', async () => {
    const app = buildProtectedApp('owner', null);
    const res = await app.request('/settings/white-label', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settings).toBeNull();
    expect(data.assets).toEqual({ logoUrl: null, faviconUrl: null, loginBackgroundUrl: null });
  });

  it('owner can read configured settings with a presigned logo url', async () => {
    const app = buildProtectedApp('owner', BRANDING_ROW);
    const res = await app.request('/settings/white-label', { headers: authHeaders() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settings.productName).toBe('Acme Cloud');
    expect(data.assets.logoUrl).toContain('logo.png');
    expect(data.assets.faviconUrl).toBeNull();
  });

  it('owner can create settings', async () => {
    const app = buildProtectedApp('owner', null);
    const res = await app.request('/settings/white-label', put({ productName: 'Acme Cloud' }));
    expect([200, 201]).toContain(res.status);
  });

  it('owner can update settings on an existing record', async () => {
    const app = buildProtectedApp('owner', BRANDING_ROW);
    const res = await app.request(
      '/settings/white-label',
      put({ tagline: 'New tagline', customDomain: 'APP.acme.com' }),
    );
    expect(res.status).toBe(200);
  });

  it('normalises customDomain to lowercase', async () => {
    const app = buildProtectedApp('owner', BRANDING_ROW);
    const res = await app.request('/settings/white-label', put({ customDomain: 'APP.acme.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.settings.customDomain).toBe(BRANDING_ROW.customDomain);
  });

  it('rejects a custom domain another org already claimed (409)', async () => {
    const app = buildProtectedApp(
      'owner',
      { id: 'wl-1' },
      { id: 'wl-2', organizationId: 'org-2', customDomain: 'taken.acme.com' },
    );
    const res = await app.request('/settings/white-label', put({ customDomain: 'taken.acme.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already in use/i);
  });

  it('lets an org re-save the domain it already owns', async () => {
    const app = buildProtectedApp(
      'owner',
      { id: 'wl-1' },
      { id: 'wl-1', organizationId: 'org-1', customDomain: 'app.acme.com' },
    );
    const res = await app.request('/settings/white-label', put({ customDomain: 'app.acme.com' }));
    expect(res.status).toBe(200);
  });

  it.each([
    ['bad hex colour', { primaryColor: 'red' }],
    ['bad email', { emailReplyTo: 'nope' }],
    ['bad terms url', { termsUrl: 'not-a-url' }],
    ['domain with scheme', { customDomain: 'https://acme.com' }],
    ['unknown font', { fontFamily: 'comic-sans' }],
    ['unknown field', { sneaky: 'value' }],
  ])('rejects %s with 422', async (_label, body) => {
    const app = buildProtectedApp('owner', null);
    const res = await app.request('/settings/white-label', put(body));
    expect(res.status).toBe(422);
  });

  it.each(['viewer', 'member', 'analyst', 'manager'])(
    '%s cannot update settings (403)',
    async (role) => {
      const app = buildProtectedApp(role, BRANDING_ROW);
      const res = await app.request('/settings/white-label', put({ productName: 'Nope' }));
      expect(res.status).toBe(403);
    },
  );

  it('admin can update settings', async () => {
    const app = buildProtectedApp('admin', BRANDING_ROW);
    const res = await app.request('/settings/white-label', put({ productName: 'Acme Cloud' }));
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated requests (401)', async () => {
    const app = buildProtectedApp('owner', null);
    const res = await app.request('/settings/white-label');
    expect(res.status).toBe(401);
  });
});

describe('White Label — assets', () => {
  it('rejects an unknown asset type (422)', async () => {
    const app = buildProtectedApp('owner', null);
    const res = await app.request('/settings/white-label/assets/banner', {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(422);
  });

  it('rejects an upload with no file (422)', async () => {
    const app = buildProtectedApp('owner', null);
    const form = new FormData();
    const res = await app.request('/settings/white-label/assets/logo', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it('rejects a disallowed mime type (422)', async () => {
    const app = buildProtectedApp('owner', null);
    const form = new FormData();
    form.append('file', new Blob(['<html></html>'], { type: 'text/html' }), 'x.html');
    const res = await app.request('/settings/white-label/assets/logo', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it('deleting an unset asset is a 404', async () => {
    const app = buildProtectedApp('owner', BRANDING_ROW);
    const res = await app.request('/settings/white-label/assets/favicon', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('deleting a set asset succeeds', async () => {
    const app = buildProtectedApp('owner', BRANDING_ROW);
    const res = await app.request('/settings/white-label/assets/logo', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it('member cannot upload an asset (403)', async () => {
    const app = buildProtectedApp('member', null);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'logo.png');
    const res = await app.request('/settings/white-label/assets/logo', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(403);
  });
});

describe('White Label — public /branding', () => {
  it('serves branding on a matching custom domain with no auth', async () => {
    const app = buildPublicApp(BRANDING_ROW);
    const res = await app.request('/api/v1/branding', { headers: { Host: 'app.acme.com' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.branding.productName).toBe('Acme Cloud');
    expect(data.branding.primaryColor).toBe('#ff0000');
  });

  it('ignores the port when matching the Host header', async () => {
    const app = buildPublicApp(BRANDING_ROW);
    const res = await app.request('/api/v1/branding', { headers: { Host: 'app.acme.com:8080' } });
    expect(res.status).toBe(200);
  });

  it('404s quietly when the Host matches no configured domain', async () => {
    const app = buildPublicApp(null);
    const res = await app.request('/api/v1/branding', { headers: { Host: 'evil.test' } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('404s when no Host header is present', async () => {
    const app = buildPublicApp(BRANDING_ROW);
    const res = await app.request('/api/v1/branding');
    expect(res.status).toBe(404);
  });
});

describe('White Label — resolveHost', () => {
  it.each([
    ['app.acme.com', 'app.acme.com'],
    ['APP.Acme.Com', 'app.acme.com'],
    ['app.acme.com:8080', 'app.acme.com'],
    ['  app.acme.com  ', 'app.acme.com'],
  ])('normalises %s', (input, expected) => {
    expect(resolveHost(input)).toBe(expected);
  });

  it.each([undefined, null, '', ':8080'])('returns null for %s', (input) => {
    expect(resolveHost(input)).toBeNull();
  });

  it('never leaks internal fields', async () => {
    const app = buildPublicApp(BRANDING_ROW);
    const res = await app.request('/api/v1/branding', { headers: { Host: 'app.acme.com' } });
    const { branding } = await res.json();
    const exposed = Object.keys(branding).sort();
    expect(exposed).toEqual(
      [
        'faviconUrl',
        'fontFamily',
        'loginBackgroundUrl',
        'logoUrl',
        'primaryColor',
        'productName',
        'secondaryColor',
        'tagline',
      ].sort(),
    );
    for (const secret of [
      'emailReplyTo',
      'emailFromName',
      'termsUrl',
      'privacyUrl',
      'customDomain',
      'organizationId',
      'id',
    ]) {
      expect(branding[secret]).toBeUndefined();
    }
  });
});
