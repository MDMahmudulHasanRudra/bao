import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@bao/config', async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters!!';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
  process.env.STORAGE_ACCESS_KEY = 'test';
  process.env.STORAGE_SECRET_KEY = 'test';
  process.env.AI_API_KEY = 'test';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY || 'test-encryption-key-at-least-32-chars!!';
  const real = await vi.importActual<typeof import('@bao/config')>('@bao/config');
  return { ...real, loadEnv: () => real.loadEnv(), getEnv: () => real.loadEnv() };
});

vi.mock('../../apps/api/src/db/index.js', () => ({ getDb: vi.fn(), closeDb: vi.fn() }));

import { Hono } from 'hono';
import { getDb } from '../../apps/api/src/db/index.js';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import leadIntelligence from '../../apps/api/src/modules/lead-intelligence/routes.js';
import { assertPromotable, sizeBand } from '../../apps/api/src/modules/lead-intelligence/promote.js';
import {
  activities,
  companies,
  contacts,
  leadCandidates,
  leads,
  leadEvidence,
  memberships,
  webDocuments,
} from '../../apps/api/src/db/schema.js';

type Candidate = {
  id: string;
  organizationId: string;
  companyName: string;
  normalizedDomain: string | null;
  score: number | null;
  status: string;
  leadId: string | null;
  companyId: string | null;
  summary: string | null;
  scoreReasons: string[] | null;
};

const baseCandidate: Candidate = {
  id: 'c1',
  organizationId: 'org-a',
  companyName: 'Acme Logistics',
  normalizedDomain: 'acme.test',
  score: 82,
  status: 'qualified',
  leadId: null,
  companyId: null,
  summary: 'Regional 3PL.',
  scoreReasons: ['Uses a legacy WMS'],
};

type Locks = { table: string; strength: string };

function resolved<T>(rows: T[], onFor?: (table: string, strength: string) => void, table = '') {
  // Every builder method returns the same thenable node, so chains stay chainable in any
  // order (`.where().limit().for()`) while `await` still yields the rows — which is how the
  // real Drizzle builder behaves.
  const b: Record<string, unknown> = {
    limit: () => b,
    orderBy: () => b,
    returning: () => b,
    set: () => b,
    where: () => b,
    for: (strength: string) => {
      onFor?.(table, strength);
      return b;
    },
    then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(ok, bad),
  };
  return b;
}

function mockDb(
  candidate: Candidate | null,
  opts: { emails?: string[]; role?: string } = {},
) {
  const writes: Record<string, unknown[]> = { companies: [], contacts: [], leads: [], activities: [] };
  const locks: Locks[] = [];
  const sql: string[] = [];
  // Which connection object each CRM write went through. Every one of them must be the
  // transaction — a write on the outer `db` would escape the rollback.
  const writesOutsideTx: string[] = [];

  // One query surface, used for both the transaction handle and the outer pool, so the
  // tenant middleware's membership lookup keeps working outside the transaction.
  const surface = (inTx: boolean) => ({
    select: () => ({
      from: (table: object) => ({
        where: () => {
          if (table === memberships) {
            return resolved([{ userId: 'u1', organizationId: 'org-a', role: opts.role ?? 'manager' }]);
          }
          if (table === leadCandidates) {
            return resolved(candidate ? [candidate] : [], (t, s) => locks.push({ table: t, strength: s }), 'leadCandidates');
          }
          if (table === leadEvidence) {
            return resolved([{ claim: 'Says nothing useful', sourceUrl: 'https://acme.test', documentId: 'd1' }]);
          }
          if (table === webDocuments) return resolved([{ emails: opts.emails ?? [] }]);
          if (table === companies) return resolved([]);
          return resolved([]);
        },
      }),
    }),
    insert: (table: object) => ({
      values: (row: Record<string, unknown>) => {
        const key =
          table === companies ? 'companies'
          : table === contacts ? 'contacts'
          : table === leads ? 'leads'
          : table === activities ? 'activities'
          : 'other';
        if (inTx || key === 'other') writes[key].push(row);
        if (!inTx && key !== 'other') writesOutsideTx.push(key);
        return resolved([{ id: `${key}-1`, ...row }]);
      },
    }),
    update: () => ({ set: () => ({ where: () => resolved([]) }) }),
    execute: (q: unknown) => {
      sql.push(JSON.stringify(q));
      return Promise.resolve([]);
    },
  });

  vi.mocked(getDb).mockReturnValue({
    ...surface(false),
    transaction: (cb: (tx: unknown) => unknown) => cb(surface(true)),
  } as never);
  return { ...writes, locks, sql, writesOutsideTx };
}

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/lead-intelligence', leadIntelligence);
  return app;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${signToken({ sub: 'u1', email: 'u@t.com' })}`,
    'x-organization-id': 'org-a',
    'content-type': 'application/json',
  };
}

beforeEach(() => vi.clearAllMocks());

describe('lead promotion', () => {
  it('creates a company and lead, and records why on the timeline', async () => {
    const writes = mockDb(baseCandidate);
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leadId).toBe('leads-1');
    expect(body.alreadyPromoted).toBe(false);

    expect(writes.companies[0]).toMatchObject({ name: 'Acme Logistics', domain: 'acme.test' });
    // The provenance that justified the lead has to survive the promotion.
    expect((writes.leads[0].metadata as Record<string, unknown>).evidence).toEqual([
      { claim: 'Says nothing useful', sourceUrl: 'https://acme.test' },
    ]);
    expect(writes.activities[0]).toMatchObject({ leadId: 'leads-1', type: 'note' });
  });

  it('takes the contact email from the crawler, not from AI-written claim text', async () => {
    const writes = mockDb(baseCandidate, { emails: ['real@acme.test'] });
    const app = buildApp();
    await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });
    expect(writes.contacts[0]).toMatchObject({ email: 'real@acme.test' });
  });

  it('does not fabricate a contact when the crawl found no email', async () => {
    const writes = mockDb(baseCandidate, { emails: [] });
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(writes.contacts).toHaveLength(0);
  });

  it('locks the candidate row, so a concurrent promote cannot slip past the leadId check', async () => {
    // A mocked DB cannot prove real concurrency — that needs a live Postgres. What it can
    // prove is that the *mechanism* is present. An application-level `if (!leadId)` check
    // reads null in both requests before either writes, so the lock clause is the only
    // thing standing between two simultaneous clicks and two leads.
    const db = mockDb(baseCandidate);
    const app = buildApp();
    await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });

    expect(db.locks).toContainEqual({ table: 'leadCandidates', strength: 'update' });
  });

  it('writes every CRM record inside the transaction', async () => {
    // If any of these escaped to the outer pool connection, a later failure could not roll
    // it back and the retry would duplicate it.
    const db = mockDb(baseCandidate, { emails: ['real@acme.test'] });
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });

    expect(res.status).toBe(200);
    expect(db.companies).toHaveLength(1);
    expect(db.contacts).toHaveLength(1);
    expect(db.leads).toHaveLength(1);
    expect(db.activities).toHaveLength(1);
    expect(db.writesOutsideTx).toEqual([]);
  });

  it('takes a tenant-scoped advisory lock on the domain before reusing a company', async () => {
    // `companies` has no unique index on (organization_id, domain), so two candidates from
    // different jobs sharing a domain would otherwise create two accounts for one company.
    const db = mockDb(baseCandidate);
    const app = buildApp();
    await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });

    expect(db.sql.join('')).toContain('pg_advisory_xact_lock');
    expect(db.sql.join('')).toContain('org-a:acme.test');
  });

  it('is idempotent so a double-click cannot duplicate revenue', async () => {
    const writes = mockDb({ ...baseCandidate, status: 'imported', leadId: 'lead-existing' });
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });

    const body = await res.json();
    expect(body).toMatchObject({ leadId: 'lead-existing', alreadyPromoted: true });
    expect(writes.leads).toHaveLength(0);
    expect(writes.activities).toHaveLength(0);
  });

  it('refuses a candidate that analysis never scored', async () => {
    const writes = mockDb({ ...baseCandidate, score: null, status: 'discovered' });
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(writes.leads).toHaveLength(0);
  });

  it('cannot promote a candidate outside the tenant', async () => {
    const writes = mockDb(null);
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(writes.leads).toHaveLength(0);
  });

  it('is gated on lead-intelligence.review, not just being logged in', async () => {
    const writes = mockDb(baseCandidate, { role: 'member' });
    const app = buildApp();
    const res = await app.request('/lead-intelligence/candidates/c1/promote', { method: 'POST', headers: authHeaders() });
    expect(res.status).toBe(403);
    expect(writes.leads).toHaveLength(0);
  });
});

describe('promotion helpers', () => {
  it('refuses to promote an unscored candidate but allows one already imported', () => {
    expect(() => assertPromotable({ score: null, status: 'discovered' })).toThrow(
      expect.objectContaining({ details: expect.objectContaining({ candidate: expect.stringMatching(/no score/i) }) }),
    );
    expect(() => assertPromotable({ score: 0, status: 'discovered' })).not.toThrow();
    expect(() => assertPromotable({ score: null, status: 'imported' })).not.toThrow();
  });

  it('bands headcount into the company size vocabulary', () => {
    expect(sizeBand(5, 9)).toBe('1-10');
    expect(sizeBand(11, 40)).toBe('11-50');
    expect(sizeBand(120, 180)).toBe('51-200');
    expect(sizeBand(400)).toBe('201-500');
    expect(sizeBand(900)).toBe('501-1000');
    expect(sizeBand(5000, 9000)).toBe('1000+ (5000-9000)');
    expect(sizeBand(null, null)).toBeUndefined();
  });
});
