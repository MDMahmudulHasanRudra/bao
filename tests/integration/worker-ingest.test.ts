import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@bao/config', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters!';
  process.env.STORAGE_ENDPOINT = 'http://localhost:9000';
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

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: vi.fn() })),
  GetObjectCommand: vi.fn(),
}));

import {
  assertSafeUrl,
  extractText,
  loadSource,
  processDocument,
  processUrl,
  setSqlClientForTests,
} from '../../apps/worker/src/ingest.js';

function makeSqlClient() {
  const queryTag = vi.fn();
  const begin = vi.fn();
  const unsafe = vi.fn();
  const end = vi.fn();
  const client = Object.assign(queryTag, { begin, unsafe, end }) as never;
  return { client, queryTag, begin, unsafe, end };
}

let sql: ReturnType<typeof makeSqlClient>;

beforeEach(() => {
  vi.clearAllMocks();
  sql = makeSqlClient();
  setSqlClientForTests(sql.client);
});

describe('assertSafeUrl — SSRF policy', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/http or https/);
    await expect(assertSafeUrl('javascript:alert(1)')).rejects.toThrow(/http or https/);
    await expect(assertSafeUrl('ftp://example.com')).rejects.toThrow(/http or https/);
  });

  it('rejects embedded credentials', async () => {
    await expect(assertSafeUrl('http://user:pass@example.com')).rejects.toThrow(/credentials/);
  });

  it('rejects localhost and private literal hosts', async () => {
    await expect(assertSafeUrl('http://localhost/admin')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://10.0.0.5/')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://192.168.1.1/')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /not allowed/,
    );
    await expect(assertSafeUrl('http://172.16.0.1/')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://[::1]/')).rejects.toThrow(/not allowed/);
  });

  it('rejects internal hostnames', async () => {
    await expect(assertSafeUrl('http://metadata.google.internal/')).rejects.toThrow(/not allowed/);
    await expect(assertSafeUrl('http://db.local/')).rejects.toThrow(/not allowed/);
  });

  it('rejects invalid URLs', async () => {
    await expect(assertSafeUrl('not-a-url')).rejects.toThrow(/Invalid URL/);
  });
});

describe('extractText — no false success', () => {
  it('rejects empty buffers', async () => {
    await expect(extractText(Buffer.from(''), 'text/plain')).rejects.toThrow(/Empty/);
  });

  it('rejects unsupported mime types instead of placeholder', async () => {
    await expect(extractText(Buffer.from('x'), 'application/octet-stream')).rejects.toThrow(
      /Unsupported file type/,
    );
  });

  it('extracts plain text', async () => {
    const text = await extractText(Buffer.from('hello world'), 'text/plain');
    expect(text).toBe('hello world');
  });
});

describe('loadSource — tenant binding', () => {
  it('queries by id AND organization_id', async () => {
    sql.queryTag.mockResolvedValueOnce([
      { id: 's1', organization_id: 'org-a', storage_key: null, mime_type: null, url: null },
    ]);
    const row = await loadSource('s1', 'org-a');
    expect(row.organization_id).toBe('org-a');
    const sqlString = String(sql.queryTag.mock.calls[0][0]);
    expect(sqlString).toContain('organization_id');
    expect(sqlString).toContain('id');
  });

  it('throws when source belongs to another organization', async () => {
    sql.queryTag.mockResolvedValueOnce([]);
    await expect(loadSource('s1', 'org-b')).rejects.toThrow(/not found for organization/);
  });
});

describe('processDocument — rejects cross-tenant and missing content', () => {
  it('fails without mutating when source is not in the job organization', async () => {
    sql.queryTag.mockResolvedValueOnce([]);
    await expect(
      processDocument({
        sourceId: 's1',
        organizationId: 'org-attacker',
        storageKey: 'org/org-victim/knowledge/x.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow(/not found for organization/);
    expect(sql.unsafe).not.toHaveBeenCalled();
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it('fails when storage object is missing', async () => {
    sql.queryTag.mockResolvedValueOnce([
      {
        id: 's1',
        organization_id: 'org-a',
        storage_key: null,
        mime_type: 'text/plain',
        url: null,
      },
    ]);
    sql.unsafe.mockResolvedValueOnce([{ id: 's1' }]);
    await expect(
      processDocument({ sourceId: 's1', organizationId: 'org-a', storageKey: 'k' }),
    ).rejects.toThrow(/no storage object/);
  });

  it('rejects storage keys outside the source organization prefix', async () => {
    sql.queryTag.mockResolvedValueOnce([
      {
        id: 's1',
        organization_id: 'org-a',
        storage_key: 'org/org-b/knowledge/steal.pdf',
        mime_type: 'text/plain',
        url: null,
      },
    ]);
    sql.unsafe.mockResolvedValueOnce([{ id: 's1' }]);
    await expect(
      processDocument({ sourceId: 's1', organizationId: 'org-a', storageKey: 'x' }),
    ).rejects.toThrow(/outside the source organization/);
  });
});

describe('processUrl — failures stay failures', () => {
  it('rejects cross-tenant URL jobs before status writes', async () => {
    sql.queryTag.mockResolvedValueOnce([]);
    await expect(
      processUrl({ sourceId: 's1', organizationId: 'org-b', url: 'http://example.com' }),
    ).rejects.toThrow(/not found for organization/);
    expect(sql.unsafe).not.toHaveBeenCalled();
  });

  it('marks error (not ready) when URL is blocked by SSRF policy', async () => {
    sql.queryTag.mockResolvedValueOnce([
      {
        id: 's1',
        organization_id: 'org-a',
        storage_key: null,
        mime_type: null,
        url: 'http://169.254.169.254/latest/meta-data',
      },
    ]);
    sql.unsafe.mockResolvedValue([{ id: 's1' }]);

    await expect(
      processUrl({
        sourceId: 's1',
        organizationId: 'org-a',
        url: 'http://169.254.169.254/latest/meta-data',
      }),
    ).rejects.toThrow(/not allowed/);

    expect(sql.unsafe.mock.calls.length).toBeGreaterThanOrEqual(2);
    const statuses = sql.unsafe.mock.calls.map((c) => c[1][2]);
    expect(statuses).toContain('processing');
    const last = sql.unsafe.mock.calls[sql.unsafe.mock.calls.length - 1];
    expect(last[1][2]).toBe('error');
    expect(String(last[0])).not.toContain('chunk_count');
  });

  it('does not write placeholder chunks on fetch failure', async () => {
    sql.queryTag.mockResolvedValueOnce([
      {
        id: 's1',
        organization_id: 'org-a',
        storage_key: null,
        mime_type: null,
        url: 'http://127.0.0.1/',
      },
    ]);
    sql.unsafe.mockResolvedValue([{ id: 's1' }]);

    await expect(
      processUrl({ sourceId: 's1', organizationId: 'org-a', url: 'http://127.0.0.1/' }),
    ).rejects.toThrow();
    expect(sql.begin).not.toHaveBeenCalled();
  });
});
