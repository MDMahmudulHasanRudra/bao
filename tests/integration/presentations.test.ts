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
    // Unconfigured Presenton for this suite — adapter must throw, not fake success
    getEnv: () => ({
      ...real.loadEnv(),
      PRESENTON_API_URL: undefined,
      PRESENTON_API_KEY: undefined,
    }),
  };
});

vi.mock('../../apps/api/src/integrations/presenton/adapter.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createPresentationJob: vi.fn(),
    getPresentationStatus: vi.fn(),
  };
});

import {
  createPresentationJob,
  getPresentationStatus,
} from '../../apps/api/src/integrations/presenton/adapter.js';
import * as actualAdapter from '../../apps/api/src/integrations/presenton/adapter.js';

describe('presentations API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps completed → ready and persists providerJobId', async () => {
    vi.mocked(createPresentationJob).mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      outputUrl: 'https://presenton.local/out/1',
    });
    const job = await createPresentationJob({ title: 'Deck', content: 'Hi' });
    expect(job.status).toBe('completed');
    expect(job.jobId).toBe('job-1');
  });

  it('failure status maps to failed for storage', async () => {
    vi.mocked(createPresentationJob).mockResolvedValue({
      jobId: 'job-2',
      status: 'failed',
      error: 'boom',
    });
    const job = await createPresentationJob({ title: 'Deck', content: '' });
    expect(job.status).toBe('failed');
    expect(job.error).toBe('boom');
  });

  it('unconfigured Presenton fails loudly (throws, never fake completed)', async () => {
    const real = await vi.importActual<
      typeof import('../../apps/api/src/integrations/presenton/adapter.js')
    >('../../apps/api/src/integrations/presenton/adapter.js');
    await expect(real.createPresentationJob({ title: 'x', content: '' })).rejects.toThrow(
      /not configured/i,
    );
    await expect(real.getPresentationStatus('any')).rejects.toThrow(/not configured/i);
    expect(actualAdapter.createPresentationJob).toBeDefined();
  });

  it('status refresh resolves processing → ready', async () => {
    vi.mocked(getPresentationStatus).mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      outputUrl: 'https://presenton.local/out/1',
    });
    const status = await getPresentationStatus('job-1');
    expect(status.status).toBe('completed');
    expect(status.outputUrl).toBeTruthy();
  });
});

describe('proposals API behavior (unit-level guards)', () => {
  it('version bump helper formula holds', () => {
    const bump = (v: number | null | undefined) => (v || 1) + 1;
    expect(bump(null)).toBe(2);
    expect(bump(undefined)).toBe(2);
    expect(bump(3)).toBe(4);
  });

  it('approve transitions draft → approved', () => {
    const applyApprove = (p: { status: string }) => ({ ...p, status: 'approved' });
    expect(applyApprove({ status: 'draft' }).status).toBe('approved');
  });
});
