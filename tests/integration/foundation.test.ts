import { describe, it, expect, vi } from 'vitest';
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
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import { MODULE_REGISTRY } from '../../apps/api/src/modules/module-registry/routes.js';
import moduleRegistry from '../../apps/api/src/modules/module-registry/routes.js';
import intelligence from '../../apps/api/src/modules/intelligence/routes.js';
import { getDb } from '../../apps/api/src/db/index.js';

const SHELL_IDS: string[] = [];

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
  app.route('/modules', moduleRegistry);
  app.route('/intelligence', intelligence);
  return app;
}

function authHeaders(_role?: string) {
  const token = signToken({ sub: 'u1', email: 'u@t.com' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': 'org-1',
  };
}

describe('module registry truth (P0-2)', () => {
  it('every module has uiAvailable boolean', () => {
    for (const m of MODULE_REGISTRY) {
      expect(typeof m.uiAvailable).toBe('boolean');
    }
  });

  it('shell modules are not claimed as UI-available', () => {
    for (const id of SHELL_IDS) {
      const m = MODULE_REGISTRY.find((x) => x.id === id)!;
      expect(m, `missing ${id}`).toBeDefined();
      expect(m.uiAvailable, `${id} should not claim UI`).toBe(false);
    }
  });

  it('dashboard, settings, knowledge, assistant, sales, notifications, proposals, and presentations have real UI', () => {
    expect(MODULE_REGISTRY.find((m) => m.id === 'dashboard')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'settings')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'knowledge')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'ai-assistant')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'sales')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'notifications')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'proposals')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'presentations')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'intelligence')?.uiAvailable).toBe(true);
    expect(MODULE_REGISTRY.find((m) => m.id === 'analytics')?.uiAvailable).toBe(true);
  });

  it('comingSoon modules are not uiAvailable', () => {
    for (const m of MODULE_REGISTRY.filter((x) => x.comingSoon)) {
      expect(m.uiAvailable).toBe(false);
      expect(m.enabled).toBe(false);
    }
  });

  it('GET /modules returns uiAvailable and comingSoon list', async () => {
    const app = buildApp('owner');
    const res = await app.request('/modules', { headers: authHeaders('owner') });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.modules.length).toBeGreaterThan(0);
    for (const m of body.modules) {
      expect(typeof m.uiAvailable).toBe('boolean');
    }
    expect(body.comingSoon.length).toBeGreaterThan(0);
    for (const c of body.comingSoon) {
      expect(c.enabled).toBe(false);
      expect(c.uiAvailable).toBe(false);
    }
    // Dashboard present with UI; shell modules present but flagged
    const dash = body.modules.find((m: { id: string }) => m.id === 'dashboard');
    expect(dash?.uiAvailable).toBe(true);
    const knowledge = body.modules.find((m: { id: string }) => m.id === 'knowledge');
    expect(knowledge?.uiAvailable).toBe(true);
    const assistant = body.modules.find((m: { id: string }) => m.id === 'ai-assistant');
    expect(assistant?.uiAvailable).toBe(true);
  });

  it('viewers still filtered from settings in payload', async () => {
    const app = buildApp('viewer');
    const res = await app.request('/modules', { headers: authHeaders('viewer') });
    const body = await res.json();
    expect(body.modules.find((m: { id: string }) => m.id === 'settings')).toBeUndefined();
  });
});

describe('knowledge status contract (P1-1)', () => {
  const pagePath = resolve(__dirname, '../../apps/web/src/app/(workspace)/knowledge/page.tsx');

  it('UI maps the real worker statuses: pending, processing, ready, error', () => {
    const src = readFileSync(pagePath, 'utf-8');
    for (const status of ['pending', 'processing', 'ready', 'error']) {
      expect(src, `status map missing ${status}`).toMatch(
        new RegExp(`${status}\\s*:\\s*\\{[^}]*label`),
      );
    }
  });

  it('UI handles empty, loading, error, and upload/URL/search affordances', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/Add your first source/);
    expect(src).toMatch(/Loading knowledge sources/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/knowledge\/upload/);
    expect(src).toMatch(/knowledge\/url/);
    expect(src).toMatch(/knowledge\/search/);
    expect(src).toMatch(/confirm\(/);
  });

  it('worker sets the same statuses the UI renders', async () => {
    const worker = readFileSync(resolve(__dirname, '../../apps/worker/src/ingest.ts'), 'utf-8');
    expect(worker).toMatch(/setStatus\([^,]+,\s*[^,]+,\s*'processing'\)/);
    expect(worker).toMatch(/setStatus\([^,]+,\s*[^,]+,\s*'ready'/);
    expect(worker).toMatch(/setStatus\([^,]+,\s*[^,]+,\s*'error'/);
    const routes = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/knowledge/routes.ts'),
      'utf-8',
    );
    expect(routes).toMatch(/status:\s*'pending'/);
  });

  it('knowledge kinds: SOP tag, kind filter, expandable source details (Slice D)', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/kindOf/);
    expect(src).toMatch(/kkindfilter/);
    expect(src).toMatch(/KIND_OPTIONS/);
    expect(src).toMatch(/Hide details|Details/);
    expect(src).toMatch(/source-detail/);
    expect(src).toMatch(/aria-expanded=\{expandedId === s\.id\}/);
    expect(src).toMatch(/toggleDetails/);
    expect(src).toMatch(/fd\.append\('kind', fileKind\)/);

    const routes = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/knowledge/routes.ts'),
      'utf-8',
    );
    expect(routes).toMatch(/normalizeKind/);
    expect(routes).toMatch(/'sop'/);
    expect(routes).toMatch(/->>'kind'/);
    expect(routes).toMatch(/normalizeKind\(body\.kind\)/);
  });
});

describe('responsive shell + route states (P1-3)', () => {
  const layoutPath = resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx');
  const loadingPath = resolve(__dirname, '../../apps/web/src/app/(workspace)/loading.tsx');
  const errorPath = resolve(__dirname, '../../apps/web/src/app/(workspace)/error.tsx');
  const globalsPath = resolve(__dirname, '../../apps/web/src/app/globals.css');

  it('layout collapses sidebar at md (≤768px) with hamburger + a11y wiring', () => {
    const src = readFileSync(layoutPath, 'utf-8');
    expect(src).toMatch(/md:hidden/);
    expect(src).toMatch(/md:static md:flex/);
    expect(src).toMatch(/aria-expanded=\{navOpen\}/);
    expect(src).toMatch(/aria-controls="workspace-nav"/);
    expect(src).toMatch(/aria-current=\{active \? 'page' : undefined\}/);
    expect(src).toMatch(/min-w-0/);
  });

  it('layout uses a single SVG icon set (no unicode nav glyphs)', () => {
    const src = readFileSync(layoutPath, 'utf-8');
    expect(src).toMatch(/<svg/);
    expect(src).toMatch(/NavIcon/);
    expect(src).not.toMatch(/[⌂▤✦◈▣▷◉⚙☰]/);
  });

  it('workspace loading route announces status', () => {
    const src = readFileSync(loadingPath, 'utf-8');
    expect(src).toMatch(/role="status"/);
    expect(src).toMatch(/Loading/);
  });

  it('workspace error boundary has recovery: retry + back + role=alert', () => {
    const src = readFileSync(errorPath, 'utf-8');
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/onClick=\{reset\}/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/history\.back/);
    expect(src).toMatch(/'use client'/);
  });

  it('globals respects reduced motion and visible keyboard focus', () => {
    const css = readFileSync(globalsPath, 'utf-8');
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/outline/);
  });
});

describe('sales workspace UI contract (P1-4)', () => {
  const pagePath = resolve(__dirname, '../../apps/web/src/app/(workspace)/sales/page.tsx');

  it('page covers pipeline board, companies, contacts, activities with real endpoints', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/sales\/leads/);
    expect(src).toMatch(/\/api\/v1\/sales\/companies/);
    expect(src).toMatch(/\/api\/v1\/sales\/contacts/);
    expect(src).toMatch(/\/api\/v1\/sales\/activities/);
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/No leads yet/);
    expect(src).toMatch(/No companies yet/);
    expect(src).toMatch(/No contacts yet/);
    expect(src).toMatch(/No activity yet/);
  });

  it('stage moves use the API transition map and surface a friendly 403', () => {
    const src = readFileSync(pagePath, 'utf-8');
    for (const stage of [
      'new',
      'qualified',
      'proposal',
      'negotiation',
      'closed_won',
      'closed_lost',
    ]) {
      expect(src, `stage label missing ${stage}`).toContain(`'${stage}'`);
    }
    expect(src).toMatch(/Invalid stage transition/i);
    expect(src).toMatch(/friendlyStageError/);
    expect(src).toMatch(/TRANSITIONS/);
    expect(src).toMatch(/method: 'PUT'/);
  });

  it('has loading, error+retry, role=alert, confirm, ownership, and mobile layouts', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/Loading sales workspace/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/confirm\(/);
    expect(src).toMatch(/Yours/);
    expect(src).toMatch(/ownerId/);
    expect(src).toMatch(/md:grid-cols-3|sm:grid-cols-2/);
  });
});

describe('notifications producers + inbox UI (P1-5)', () => {
  const pagePath = resolve(__dirname, '../../apps/web/src/app/(workspace)/notifications/page.tsx');
  const layoutPath = resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx');
  const accessPath = resolve(__dirname, '../../apps/api/src/modules/access-control/routes.ts');
  const assistantPath = resolve(__dirname, '../../apps/api/src/modules/ai-assistant/routes.ts');
  const proposalsPath = resolve(__dirname, '../../apps/api/src/modules/proposals/routes.ts');
  const workerPath = resolve(__dirname, '../../apps/worker/src/ingest.ts');
  const servicePath = resolve(__dirname, '../../apps/api/src/modules/notifications/service.ts');

  it('emitters exist for invite, role change, assistant reply, proposal approval, knowledge ready', () => {
    const access = readFileSync(accessPath, 'utf-8');
    expect(access).toMatch(/notify\(c,\s*user\.id,\s*'member\.invite'/);
    expect(access).toMatch(/notify\(c,\s*targetMembership\.userId,\s*'member\.role_change'/);
    const assistant = readFileSync(assistantPath, 'utf-8');
    expect(assistant).toMatch(/notify\(c,\s*conversation\.userId,\s*'assistant\.reply'/);
    const proposals = readFileSync(proposalsPath, 'utf-8');
    expect(proposals).toMatch(/notify\(c,\s*updated\.createdBy,\s*'proposal\.approve'/);
    const worker = readFileSync(workerPath, 'utf-8');
    expect(worker).toMatch(/notifyReady\(/);
    expect(worker).toMatch(/'knowledge\.ready'/);
    expect(worker).toMatch(/INSERT INTO notifications/);
  });

  it('notify helper is best-effort and org+user scoped (no secret payload)', () => {
    const svc = readFileSync(servicePath, 'utf-8');
    expect(svc).toMatch(/organizationId/);
    expect(svc).toMatch(/userId/);
    expect(svc).toMatch(/Notification should never fail/);
    expect(svc).not.toMatch(/sk-|api[_-]?key|password|secret/i);
  });

  it('inbox page lists, marks read, has empty/loading/error states', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/notifications/);
    expect(src).toMatch(/\/read-all/);
    expect(src).toMatch(/Mark read/);
    expect(src).toMatch(/Mark all read/);
    expect(src).toMatch(/No notifications yet/);
    expect(src).toMatch(/Loading notifications/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/unread/i);
  });

  it('shell shows unread badge and nav entry for notifications', () => {
    const src = readFileSync(layoutPath, 'utf-8');
    expect(src).toMatch(/href: '\/notifications'/);
    expect(src).toMatch(/unreadCount/);
    expect(src).toMatch(/unread notifications/);
    expect(src).toMatch(/NavIcon id=\{item\.moduleId\}/);
  });
});

describe('intelligence target mutation gates (P0-2)', () => {
  it('POST /targets denied for member', async () => {
    const app = buildApp('member');
    const res = await app.request('/intelligence/targets', {
      method: 'POST',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 't', type: 'competitor', config: {} }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toMatch(/intelligence\.targets\.manage/);
  });

  it('PUT /targets/:id denied for member (was missing check)', async () => {
    const app = buildApp('member');
    const res = await app.request('/intelligence/targets/t1', {
      method: 'PUT',
      headers: { ...authHeaders('member'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toMatch(/intelligence\.targets\.manage/);
  });

  it('DELETE /targets/:id denied for member (was missing check)', async () => {
    const app = buildApp('member');
    const res = await app.request('/intelligence/targets/t1', {
      method: 'DELETE',
      headers: authHeaders('member'),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.message).toMatch(/intelligence\.targets\.manage/);
  });

  it('analyst can create a target', async () => {
    const app = buildApp('analyst');
    const res = await app.request('/intelligence/targets', {
      method: 'POST',
      headers: { ...authHeaders('analyst'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 't', type: 'competitor', config: {} }),
    });
    expect(res.status).toBe(201);
  });

  it('member can still read targets', async () => {
    const app = buildApp('member');
    const res = await app.request('/intelligence/targets', { headers: authHeaders('member') });
    expect(res.status).toBe(200);
  });
});

describe('audit visibility + AI run events (P1-6)', () => {
  const auditRoutesPath = resolve(__dirname, '../../apps/api/src/modules/audit/routes.ts');
  const auditServicePath = resolve(__dirname, '../../apps/api/src/modules/audit/service.ts');
  const auditPagePath = resolve(
    __dirname,
    '../../apps/web/src/app/(workspace)/settings/audit/page.tsx',
  );

  it('GET /audit is permission-gated, org-scoped, and redacts details', () => {
    const routes = readFileSync(auditRoutesPath, 'utf-8');
    expect(routes).toMatch(/requirePermission\('audit\.read'\)/);
    expect(routes).toMatch(/eq\(auditEvents\.organizationId,\s*tenant\.organizationId\)/);
    expect(routes).toMatch(/redactDetails\(/);
  });

  it('write path and read path both redact secret material', () => {
    const svc = readFileSync(auditServicePath, 'utf-8');
    expect(svc).toMatch(/details: redactDetails\(/);
    expect(svc).toMatch(/SECRET_KEY/);
    expect(svc).toMatch(/SECRET_VALUE/);
  });

  it('assistant and provider audit actions are wired in source', () => {
    const assistant = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-assistant/routes.ts'),
      'utf-8',
    );
    expect(assistant).toMatch(/audit\(c,\s*'ai\.assistant\.run'/);
    const aiSettings = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-settings/routes.ts'),
      'utf-8',
    );
    for (const action of [
      'ai.provider.create',
      'ai.provider.test',
      'ai.provider.rotate',
      'ai.provider.revoke',
      'ai.model_default.update',
    ]) {
      expect(aiSettings).toContain(`'${action}'`);
    }
  });

  it('audit UI has loading/unauthorized/error/empty + masked-details copy', () => {
    const src = readFileSync(auditPagePath, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/audit/);
    expect(src).toMatch(/Loading audit log/);
    expect(src).toMatch(/permission to view the audit log/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No audit events yet/);
    expect(src).toMatch(/secrets are masked/);
  });

  it('shell navigates to /settings/audit', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx'),
      'utf-8',
    );
    expect(layout).toMatch(/href: '\/settings\/audit'/);
    expect(layout).toMatch(/Audit Log/);
  });
});

describe('proposals + presentations UI (P2-1)', () => {
  const proposalsPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/proposals/page.tsx');
  const presentationsPage = resolve(
    __dirname,
    '../../apps/web/src/app/(workspace)/presentations/page.tsx',
  );
  const presentonPath = resolve(__dirname, '../../apps/api/src/integrations/presenton/adapter.ts');
  const presentRoutes = resolve(__dirname, '../../apps/api/src/modules/presentations/routes.ts');
  const propRoutes = resolve(__dirname, '../../apps/api/src/modules/proposals/routes.ts');

  it('proposals page has create, templates, version badge, approve, empty/loading/error', () => {
    const src = readFileSync(proposalsPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/proposals/);
    expect(src).toMatch(/\/api\/v1\/proposals\/templates/);
    expect(src).toMatch(/Loading proposals/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No proposals yet/);
    expect(src).toMatch(/Approve/);
    expect(src).toMatch(/version|→ v/);
    expect(src).toMatch(/Create proposal/);
    expect(src).toMatch(/Save template/);
  });

  it('presentations page has request form, status badges, output link, failure state', () => {
    const src = readFileSync(presentationsPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/presentations/);
    expect(src).toMatch(/Loading presentations/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No presentations yet/);
    expect(src).toMatch(/Request presentation/);
    expect(src).toMatch(/Check status/);
    expect(src).toMatch(/Open presentation/);
    for (const s of ['pending', 'processing', 'ready', 'failed']) {
      expect(src, `status missing ${s}`).toContain(`'${s}'`);
    }
  });

  it('Presenton adapter fails loudly when unconfigured (no fake completed)', () => {
    const src = readFileSync(presentonPath, 'utf-8');
    expect(src).toMatch(/PRESENTON_API_URL/);
    expect(src).toMatch(/throw notConfigured\(\)/);
    expect(src).not.toMatch(/status:\s*'completed'[\s\S]{0,40}mock-/);
  });

  it('presentation routes wire createPresentationJob + map completed→ready', () => {
    const src = readFileSync(presentRoutes, 'utf-8');
    expect(src).toMatch(/createPresentationJob\(/);
    expect(src).toMatch(/getPresentationStatus\(/);
    expect(src).toMatch(/mapJobStatus/);
    expect(src).toMatch(/'ready'/);
    expect(src).toMatch(/status:\s*'failed'/);
    expect(src).toMatch(/audit\(c,\s*'presentation\.create'/);
  });

  it('proposal routes keep version bump, approve, and audit', () => {
    const src = readFileSync(propRoutes, 'utf-8');
    expect(src).toMatch(/version = \(proposal\.version \|\| 1\) \+ 1/);
    expect(src).toMatch(/audit\(c,\s*'proposal\.approve'/);
    expect(src).toMatch(/audit\(c,\s*'proposal\.update'/);
    expect(src).toMatch(/status: 'approved'/);
  });

  it('proposal routes snapshot versions and support restore + export', () => {
    const src = readFileSync(propRoutes, 'utf-8');
    expect(src).toMatch(/proposalVersions/);
    expect(src).toMatch(/onConflictDoNothing/);
    expect(src).toMatch(/\/versions/);
    expect(src).toMatch(/\/restore/);
    expect(src).toMatch(/proposal\.version\.restore/);
    expect(src).toMatch(/contentChanged/);

    const page = readFileSync(proposalsPage, 'utf-8');
    expect(page).toMatch(/\/versions/);
    expect(page).toMatch(/Restore/);
    expect(page).toMatch(/History/);
    expect(page).toMatch(/Download \.md|downloadMarkdown/);
    expect(page).toMatch(/Export slides|exportSlides/);
    expect(page).toMatch(/\/api\/v1\/presentations/);
  });
});

describe('intelligence UI + scrape cycle (P2-2)', () => {
  const intelPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/intelligence/page.tsx');
  const intelRoutes = resolve(__dirname, '../../apps/api/src/modules/intelligence/routes.ts');
  const scraplinkPath = resolve(__dirname, '../../apps/api/src/integrations/scraplink/adapter.ts');

  it('page has targets CRUD, events review, insight cards, empty/loading/error', () => {
    const src = readFileSync(intelPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/intelligence\/targets/);
    expect(src).toMatch(/\/api\/v1\/intelligence\/events/);
    expect(src).toMatch(/Loading intelligence/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No monitoring targets yet/);
    expect(src).toMatch(/No events yet/);
    expect(src).toMatch(/Mark reviewed/);
    expect(src).toMatch(/Create target/);
    expect(src).toMatch(/Unreviewed events/);
    expect(src).toMatch(/Active targets/);
    expect(src).toMatch(/Collected with source/);
    expect(src).toMatch(/Scrape/);
    expect(src).toMatch(/role="tablist"/);
  });

  it('routes gate target mutations and wire scrape + audit', () => {
    const src = readFileSync(intelRoutes, 'utf-8');
    expect(src).toMatch(/requirePermission\('intelligence\.targets\.manage'\)/);
    expect(src).toMatch(/\/targets\/:id\/scrape/);
    expect(src).toMatch(/createScrapeJob\(/);
    expect(src).toMatch(/audit\(c,\s*'intelligence\.scrape'/);
    expect(src).toMatch(/audit\(c,\s*'intelligence\.target\.create'/);
    expect(src).toMatch(/audit\(c,\s*'intelligence\.event\.review'/);
  });

  it('ScrapLink adapter exposes mock path when unconfigured (manual cycle)', () => {
    const src = readFileSync(scraplinkPath, 'utf-8');
    expect(src).toMatch(/SCRAPLINK_API_URL/);
    expect(src).toMatch(/mock-\$\{Date\.now\(\)\}/);
    expect(src).toMatch(/not configured/i);
  });
});

describe('analytics + dashboard insight + Diffy + settings (P2-3)', () => {
  const analyticsPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/analytics/page.tsx');
  const analyticsRoutes = resolve(__dirname, '../../apps/api/src/modules/analytics/routes.ts');
  const settingsRoutes = resolve(__dirname, '../../apps/api/src/modules/settings/routes.ts');
  const dashboardPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/dashboard/page.tsx');
  const diffyPath = resolve(__dirname, '../../apps/api/src/integrations/diffy/adapter.ts');

  it('analytics page has real metrics, empty states, loading/error, Diffy compare', () => {
    const src = readFileSync(analyticsPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/analytics\/sales/);
    expect(src).toMatch(/\/api\/v1\/analytics\/knowledge/);
    expect(src).toMatch(/\/api\/v1\/analytics\/compare/);
    expect(src).toMatch(/Loading analytics/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No leads yet/);
    expect(src).toMatch(/No knowledge sources yet/);
    expect(src).toMatch(/Source:/);
    expect(src).toMatch(/Run comparison/);
    expect(src).toMatch(/role="status"/);
  });

  it('analytics routes keep org-scoped metrics and audited Diffy compare', () => {
    const src = readFileSync(analyticsRoutes, 'utf-8');
    expect(src).toMatch(/eq\(leads\.organizationId, tenant\.organizationId\)/);
    expect(src).toMatch(/eq\(knowledgeSources\.organizationId, tenant\.organizationId\)/);
    expect(src).toMatch(/createComparisonJob\(/);
    expect(src).toMatch(/audit\(c,\s*'diffy\.compare'/);
    expect(src).toMatch(/contentA/);
    expect(src).toMatch(/type: z\.enum\(\['text', 'code', 'document'\]\)/);
  });

  it('settings PUT validates known org shape (fixes C4)', () => {
    const src = readFileSync(settingsRoutes, 'utf-8');
    expect(src).toMatch(/orgSettingsSchema/);
    expect(src).toMatch(/\.strict\(\)/);
    expect(src).toMatch(/safeParse/);
    expect(src).toMatch(/ValidationError/);
    expect(src).toMatch(/audit\(c,\s*'settings\.update'/);
  });

  it('dashboard has Ask Business AI entry and evidence-backed insight cards', () => {
    const src = readFileSync(dashboardPage, 'utf-8');
    expect(src).toMatch(/Ask Business AI/);
    expect(src).toMatch(/\/assistant/);
    expect(src).toMatch(/Source:/);
    expect(src).toMatch(/freshness|Updated|Collected/i);
    expect(src).toMatch(/No leads yet|empty/i);
  });

  it('dashboard exposes open follow-ups due within 7 days (Slice B)', () => {
    const src = readFileSync(dashboardPage, 'utf-8');
    expect(src).toMatch(/upcomingActivities/);
    expect(src).toMatch(/Follow-ups/);
    const dashRoutes = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/dashboard/routes.ts'),
      'utf-8',
    );
    expect(dashRoutes).toMatch(/upcomingActivities/);
    expect(dashRoutes).toMatch(/isNull\(activities\.completedAt\)/);
    expect(dashRoutes).toMatch(/lte\(activities\.dueAt, horizon\)/);
  });

  it('Diffy adapter exposes mock path when unconfigured', () => {
    const src = readFileSync(diffyPath, 'utf-8');
    expect(src).toMatch(/DIFFY_API_URL/);
    expect(src).toMatch(/mock-\$\{Date\.now\(\)\}/);
    expect(src).toMatch(/not configured/i);
  });

  it('settings integrations status endpoint + page + NAV (Slice E)', () => {
    const src = readFileSync(settingsRoutes, 'utf-8');
    expect(src).toMatch(/settings\.get\('\/integrations'/);
    expect(src).toMatch(/aiProviders/);
    expect(src).toMatch(/PRESENTON_API_URL/);
    expect(src).toMatch(/SCRAPLINK_API_URL/);
    expect(src).toMatch(/DIFFY_API_URL/);
    expect(src).toMatch(/STORAGE_ACCESS_KEY/);
    const page = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/settings/integrations/page.tsx'),
      'utf-8',
    );
    expect(page).toMatch(/settings\/integrations/);
    expect(page).toMatch(/Connected/);
    expect(page).toMatch(/Not configured/);
    expect(page).toMatch(/role="alert"/);
    const layout = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx'),
      'utf-8',
    );
    expect(layout).toMatch(/\/settings\/integrations/);
    expect(layout).toMatch(/Integrations/);
  });
});

describe('a11y / responsive sweep (R-009)', () => {
  const layoutPath = resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx');
  const salesPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/sales/page.tsx');
  const intelPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/intelligence/page.tsx');
  const notifPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/notifications/page.tsx');
  const dashboardPage = resolve(__dirname, '../../apps/web/src/app/(workspace)/dashboard/page.tsx');

  it('layout has skip link targeting main landmark', () => {
    const src = readFileSync(layoutPath, 'utf-8');
    expect(src).toMatch(/Skip to main content/);
    expect(src).toMatch(/href="#main-content"/);
    expect(src).toMatch(/id="main-content"/);
    expect(src).toMatch(/tabIndex=\{-1\}/);
  });

  it('layout header is responsive and keeps email for screen readers on mobile', () => {
    const src = readFileSync(layoutPath, 'utf-8');
    expect(src).toMatch(/px-4 py-3 sm:px-6/);
    expect(src).toMatch(/sr-only[^"]*sm:not-sr-only/);
  });

  it('sales tabs expose tabpanel + arrow-key navigation', () => {
    const src = readFileSync(salesPage, 'utf-8');
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-labelledby=\{`sales-tab-\$\{tab\}`\}/);
    expect(src).toMatch(/aria-controls=\{`sales-panel-\$\{id\}`\}/);
    expect(src).toMatch(/ArrowLeft/);
    expect(src).toMatch(/ArrowRight/);
  });

  it('intelligence tabs expose labelled tablist, tabpanel, arrow keys', () => {
    const src = readFileSync(intelPage, 'utf-8');
    expect(src).toMatch(/aria-label="Monitoring sections"/);
    expect(src).toMatch(/id="intel-panel-targets"/);
    expect(src).toMatch(/id="intel-panel-events"/);
    expect(src).toMatch(/ArrowLeft/);
  });

  it('unread notification is announced as text, not color alone', () => {
    const src = readFileSync(notifPage, 'utf-8');
    expect(src).toMatch(/sr-only">Unread</);
    expect(src).toMatch(/aria-hidden/);
  });

  it('light-surface pages avoid failing slate-400 body text (contrast)', () => {
    const src = readFileSync(dashboardPage, 'utf-8');
    expect(src).not.toMatch(/text-slate-400/);
    const intel = readFileSync(intelPage, 'utf-8');
    expect(intel).not.toMatch(/text-slate-400/);
  });
});

describe('billing UI + API (Slice: Billing)', () => {
  const billingPage = resolve(
    __dirname,
    '../../apps/web/src/app/(workspace)/settings/billing/page.tsx',
  );
  const billingRoutes = resolve(__dirname, '../../apps/api/src/modules/billing/routes.ts');

  it('page has plans, subscription, invoices, payment methods with empty/loading/error states', () => {
    const src = readFileSync(billingPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/billing\/plans/);
    expect(src).toMatch(/\/api\/v1\/billing\/subscription/);
    expect(src).toMatch(/\/api\/v1\/billing\/invoices/);
    expect(src).toMatch(/\/api\/v1\/billing\/payment-methods/);
    expect(src).toMatch(/Loading billing/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No active subscription/);
    expect(src).toMatch(/No plans configured/);
    expect(src).toMatch(/No invoices yet/);
    expect(src).toMatch(/Subscribe/);
    expect(src).toMatch(/Change Plan/);
    expect(src).toMatch(/Cancel/);
    expect(src).toMatch(/Add Payment Method/);
    expect(src).toMatch(/statusBadge/);
    expect(src).toMatch(/formatPrice/);
  });

  it('routes expose plans CRUD, subscription, invoices, payment methods, webhook', () => {
    const src = readFileSync(billingRoutes, 'utf-8');
    expect(src).toMatch(/billingPlans/);
    expect(src).toMatch(/billingSubscriptions/);
    expect(src).toMatch(/billingInvoices/);
    expect(src).toMatch(/billingPaymentMethods/);
    expect(src).toMatch(/billingUsageRecords/);
    expect(src).toMatch(/\/plans/);
    expect(src).toMatch(/\/subscription/);
    expect(src).toMatch(/\/invoices/);
    expect(src).toMatch(/\/payment-methods/);
    expect(src).toMatch(/\/usage/);
    expect(src).toMatch(/\/webhooks\/stripe/);
    expect(src).toMatch(/requirePermission\('billing\.manage'\)/);
    expect(src).toMatch(/audit\(c,\s*'billing\.plan\.create'/);
    expect(src).toMatch(/audit\(c,\s*'billing\.subscription\.create'/);
    expect(src).toMatch(/audit\(c,\s*'billing\.payment_method\.create'/);
  });

  it('plan schema validates required fields', () => {
    const src = readFileSync(billingRoutes, 'utf-8');
    expect(src).toMatch(/planSchema.*z\.object/);
    expect(src).toMatch(/name.*z\.string.*min.*1/);
    expect(src).toMatch(/priceCents.*z\.number.*int.*min.*0/);
    expect(src).toMatch(/interval.*z\.enum.*month.*year.*week.*day/);
  });

  it('shell navigates to /settings/billing', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx'),
      'utf-8',
    );
    expect(layout).toMatch(/\/settings\/billing/);
    expect(layout).toMatch(/Billing/);
  });
});

describe('automation UI + API (Slice: Automation)', () => {
  const automationPage = resolve(
    __dirname,
    '../../apps/web/src/app/(workspace)/automation/page.tsx',
  );
  const automationRoutes = resolve(__dirname, '../../apps/api/src/modules/automation/routes.ts');

  it('page has workflows list, create/edit modal, run history, empty/loading/error states', () => {
    const src = readFileSync(automationPage, 'utf-8');
    expect(src).toMatch(/\/api\/v1\/automation\/workflows/);
    expect(src).toMatch(/Loading automations/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/No automations yet/);
    expect(src).toMatch(/Create Workflow/);
    expect(src).toMatch(/Create Workflow/);
    expect(src).toMatch(/triggerType/);
    expect(src).toMatch(/lead_created|stage_changed|activity_due|schedule|webhook/);
    expect(src).toMatch(/statusBadge/);
    expect(src).toMatch(/triggerBadge/);
    expect(src).toMatch(/View Runs/);
    expect(src).toMatch(/Run/);
    expect(src).toMatch(/Edit/);
    expect(src).toMatch(/Delete/);
    expect(src).toMatch(/confirm\(/);
  });

  it('routes expose workflows CRUD, runs, retry, trigger types', () => {
    const src = readFileSync(automationRoutes, 'utf-8');
    expect(src).toMatch(/automationWorkflows/);
    expect(src).toMatch(/automationRuns/);
    expect(src).toMatch(/\/workflows/);
    expect(src).toMatch(/\/workflows\/:id/);
    expect(src).toMatch(/\/workflows\/:id\/run/);
    expect(src).toMatch(/\/workflows\/:id\/runs/);
    expect(src).toMatch(/\/runs\/:id/);
    expect(src).toMatch(/\/runs\/:id\/retry/);
    expect(src).toMatch(/triggerSchema.*z\.object/);
    expect(src).toMatch(
      /type.*z\.enum.*lead_created.*stage_changed.*activity_due.*schedule.*webhook/,
    );
    expect(src).toMatch(/workflowSchema.*z\.object/);
    expect(src).toMatch(/requirePermission\('automation\.manage'\)/);
    expect(src).toMatch(/audit\(c,\s*'automation\.workflow\.create'/);
    expect(src).toMatch(/audit\(c,\s*'automation\.workflow\.run'/);
    expect(src).toMatch(/audit\(c,\s*'automation\.run\.retry'/);
  });

  it('shell navigates to /automation', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../apps/web/src/app/(workspace)/layout.tsx'),
      'utf-8',
    );
    expect(layout).toMatch(/\/automation/);
    expect(layout).toMatch(/Automation/);
    expect(layout).toMatch(/automation.*moduleId.*automation/);
  });
});
