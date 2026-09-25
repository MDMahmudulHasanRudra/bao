import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../../apps/api/src/integrations/ai-provider/adapter.js', () => ({
  generateCompletion: vi.fn(),
  generateEmbedding: vi.fn().mockRejectedValue(new Error('no embedding')),
  AiNotConfiguredError: class AiNotConfiguredError extends Error {},
  resolveOrgRun: vi.fn(),
  testConnection: vi.fn(),
  discoverModels: vi.fn(),
}));

import { Hono } from 'hono';
import { getDb } from '../../apps/api/src/db/index.js';
import { errorHandler } from '../../apps/api/src/core/errors/handler.js';
import { authMiddleware, signToken } from '../../apps/api/src/core/auth/jwt.js';
import { tenantMiddleware } from '../../apps/api/src/core/tenancy/context.js';
import { generateCompletion } from '../../apps/api/src/integrations/ai-provider/adapter.js';
import aiAssistant from '../../apps/api/src/modules/ai-assistant/routes.js';
import {
  aiConversations,
  aiMessages,
  auditEvents,
  knowledgeChunks,
  knowledgeSources,
  memberships,
} from '../../apps/api/src/db/schema.js';

type Table = object;

function resolved(rows: unknown[]) {
  return {
    limit: () => Promise.resolve(rows),
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

function thenable(rows: unknown[]) {
  return {
    limit: () => Promise.resolve(rows),
    orderBy: () => resolved(rows),
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  };
}

type State = {
  membership: { userId: string; organizationId: string; role: string } | null;
  conversation: Record<string, unknown> | null;
  messages: Record<string, unknown>[];
  inserted: unknown[];
  audits: unknown[];
  chunkRows: Record<string, unknown>[];
  sourceRows: Record<string, unknown>[];
};

function mockDb(state: State) {
  vi.mocked(getDb).mockReturnValue({
    select: (projection?: Record<string, unknown>) => ({
      from: (table: Table) => ({
        where: () => {
          if (table === memberships) return thenable(state.membership ? [state.membership] : []);
          if (table === aiConversations)
            return thenable(state.conversation ? [state.conversation] : []);
          if (table === aiMessages) {
            if (projection && 'count' in projection) {
              return thenable([{ count: state.messages.length || 1 }]);
            }
            return thenable(state.messages);
          }
          if (table === knowledgeSources) return thenable(state.sourceRows);
          if (table === knowledgeChunks) return thenable(state.chunkRows);
          if (table === auditEvents) return thenable(state.audits);
          return thenable([]);
        },
        innerJoin: () => ({
          where: () => {
            if (table === knowledgeChunks || table === knowledgeSources) {
              return thenable(state.chunkRows);
            }
            return thenable([]);
          },
        }),
      }),
    }),
    insert: (table: Table) => ({
      values: (row: unknown) => {
        const resolveInsert = () => {
          if (table === aiMessages) {
            const id = `msg-${state.inserted.length + 1}`;
            const saved = {
              id,
              conversationId: 'c1',
              organizationId: 'org-a',
              citations: [],
              runMetadata: {},
              ...(row as object),
            };
            state.inserted.push(saved);
            return [saved];
          }
          if (table === aiConversations) {
            const saved = { id: 'c1', ...(row as object) };
            state.inserted.push(saved);
            return [saved];
          }
          if (table === auditEvents) {
            state.audits.push(row);
            return [row];
          }
          return [{ id: 'row' }];
        };
        const result = resolveInsert();
        return {
          returning: () => Promise.resolve(result),
          then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled, onRejected),
        };
      },
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: () => ({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
    execute: () => Promise.resolve([]),
  } as never);
}

function buildApp(role = 'member') {
  const state: State = {
    membership: { userId: 'u1', organizationId: 'org-a', role },
    conversation: {
      id: 'c1',
      organizationId: 'org-a',
      userId: 'u1',
      title: 'Hello',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    messages: [],
    inserted: [],
    audits: [],
    chunkRows: [
      {
        id: 'chunk-1',
        content: 'Company holiday policy is 20 days.',
        sourceId: 'src-1',
        sourceTitle: 'Handbook',
        score: 0.9,
      },
    ],
    sourceRows: [{ id: 'src-1', status: 'ready', title: 'Handbook', organizationId: 'org-a' }],
  };
  mockDb(state);

  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', tenantMiddleware());
  app.route('/ai-assistant', aiAssistant);
  app.onError(errorHandler);
  return { app, state };
}

function authHeaders(orgId = 'org-a') {
  const token = signToken({ sub: 'u1', username: 'u' });
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': orgId,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI assistant — org-policy + cited answers (P1-2)', () => {
  it('POST message with mocked adapter returns assistant message + citations + run metadata', async () => {
    vi.mocked(generateCompletion).mockResolvedValue({
      content: 'The holiday policy is 20 days [Source 1].',
      metadata: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        latencyMs: 12,
        status: 'success',
      },
    });

    const { app, state } = buildApp('member');
    const res = await app.request('/ai-assistant/conversations/c1/messages', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'What is the holiday policy?' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userMessage.role).toBe('user');
    expect(body.assistantMessage.role).toBe('assistant');
    expect(body.assistantMessage.content).toContain('holiday policy');
    expect(Array.isArray(body.assistantMessage.citations)).toBe(true);
    expect(body.assistantMessage.citations.length).toBeGreaterThan(0);
    expect(body.assistantMessage.citations[0].title).toBe('Handbook');
    expect(body.assistantMessage.runMetadata.provider).toBe('openai');
    expect(body.assistantMessage.runMetadata.chunksUsed).toBe(1);
    // audit ai.assistant.run recorded without secret content
    const runAudit = state.audits.find(
      (a) => (a as { action?: string }).action === 'ai.assistant.run',
    );
    expect(runAudit).toBeDefined();
    const details = (runAudit as { details?: Record<string, unknown> }).details ?? {};
    expect(details.provider).toBe('openai');
    expect(JSON.stringify(details)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it('failure path: unconfigured org returns safe actionable content, not a crash', async () => {
    vi.mocked(generateCompletion).mockResolvedValue({
      content:
        'AI is not configured for this organization yet. An owner or admin can connect a provider in Settings → AI Providers, then retry.',
      metadata: {
        provider: 'unconfigured',
        model: 'none',
        latencyMs: 5,
        status: 'error',
        errorCategory: 'not_configured',
      },
    });

    const { app } = buildApp('member');
    const res = await app.request('/ai-assistant/conversations/c1/messages', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assistantMessage.runMetadata.errorCategory).toBe('not_configured');
    expect(body.assistantMessage.content).toMatch(/AI Providers/i);
    expect(body.assistantMessage.content).not.toMatch(/undefined|null/);
  });

  it('rejects empty message content', async () => {
    const { app } = buildApp('member');
    const res = await app.request('/ai-assistant/conversations/c1/messages', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: '   ' }),
    });
    expect(res.status).toBe(422);
  });

  it('404 when conversation belongs to another organization', async () => {
    const { app, state } = buildApp('member');
    state.conversation = null;
    const res = await app.request('/ai-assistant/conversations/other-org-conv/messages', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content: 'steal' }),
    });
    expect(res.status).toBe(404);
  });

  it('GET conversation list requires auth', async () => {
    const { app } = buildApp('member');
    const res = await app.request('/ai-assistant/conversations');
    expect(res.status).toBe(401);
  });

  it('retrieval join filters to ready sources only (permission-aware org scope)', async () => {
    const routesSrc = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-assistant/retrieval.ts'),
      'utf-8',
    );
    expect(routesSrc).toMatch(/eq\(memberships\.userId, userId\)/);
    expect(routesSrc).toMatch(/eq\(knowledgeChunks\.organizationId, organizationId\)/);
    expect(routesSrc).toMatch(/status = 'ready'/);
    expect(routesSrc).toMatch(/deleted_at IS NULL|eq\(knowledgeSources\.status, 'ready'\)/);
  });

  it('routes audit ai.assistant.run after message send', async () => {
    const routesSrc = readFileSync(
      resolve(__dirname, '../../apps/api/src/modules/ai-assistant/routes.ts'),
      'utf-8',
    );
    expect(routesSrc).toMatch(/ai\.assistant\.run/);
    expect(routesSrc).toMatch(/ValidationError/);
  });
});

describe('Assistant UI failure/empty path contract (P1-2)', () => {
  const pagePath = resolve(__dirname, '../../apps/web/src/app/(workspace)/assistant/page.tsx');

  it('page has loading, empty, error+retry, send, and citations affordances', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/Loading AI Assistant/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/Retry/);
    expect(src).toMatch(/Start a conversation/);
    expect(src).toMatch(/No conversations yet/);
    expect(src).toMatch(/No messages yet/);
    expect(src).toMatch(/citations/i);
    expect(src).toMatch(/ai-assistant\/conversations/);
    expect(src).toMatch(/Configure AI providers/);
  });

  it('send button shows loading and errors are announced', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/Sending…/);
    expect(src).toMatch(/disabled=\{sending \|\| !draft\.trim\(\)\}/);
  });

  it('Slice F: ?c= URL sync and follow-up suggestion chips', () => {
    const src = readFileSync(pagePath, 'utf-8');
    expect(src).toMatch(/window\.location\.search/);
    expect(src).toMatch(/URLSearchParams/);
    expect(src).toMatch(/\?c=/);
    expect(src).toMatch(/history\.replaceState/);
    expect(src).toMatch(/data-testid="assistant-suggestions"/);
    expect(src).toMatch(/applySuggestion/);
    expect(src).toMatch(/suggestions/);
    expect(src).toMatch(/lastAssistant/);
    expect(src).toMatch(/citations/);
  });
});
