import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  DiscoverySpecification,
  ResearchDepth,
  ResearchJob,
  ResearchJobStatus,
} from '@bao/contracts';
import { loadEnv } from '@bao/config';
import { getDb } from '../../db/index.js';
import { leadCandidates, companySignals, leadEvidence, researchJobs, researchTasks } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../core/errors/http.js';

const env = loadEnv();

export const RESEARCH_TASKS = [
  'discovery',
  'fetch',
  'extract',
  'normalize',
  'deduplicate',
  'classify',
  'icp_score',
  'signal_detection',
  'enrichment',
  'qualification',
  'evidence',
  'summary',
  'review',
] as const;
export type ResearchTaskType = (typeof RESEARCH_TASKS)[number];

const TERMINAL: ResearchJobStatus[] = ['completed', 'failed', 'cancelled'];

const DEPTH_LIMITS: Record<ResearchDepth, number> = {
  light: 25,
  standard: 100,
  deep: env.RESEARCH_MAX_COMPANIES,
};

/** Accepts a bare domain or a full URL and returns the bare host. */
function toSeedDomain(raw: string): string | null {
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw.trim()}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export async function createResearchJob(
  organizationId: string,
  userId: string,
  input: {
    name: string;
    spec: DiscoverySpecification;
    depth: ResearchDepth;
    seedUrls?: string[];
  },
): Promise<ResearchJob> {
  const db = getDb();
  const depth = input.depth in DEPTH_LIMITS ? input.depth : 'standard';
  const cap = Math.min(input.spec.limit, DEPTH_LIMITS[depth], env.RESEARCH_MAX_COMPANIES);
  // seed URLs are domains the user already trusts, so they are normalized into the spec
  // instead of getting their own column - discovery then reads exactly one place.
  const spec: DiscoverySpecification = {
    ...input.spec,
    seedDomains: [
      ...new Set([...(input.spec.seedDomains ?? []), ...(input.seedUrls ?? []).map(toSeedDomain)]),
    ].filter((d): d is string => d !== null),
    limit: cap,
  };

  const [row] = await db
    .insert(researchJobs)
    .values({
      organizationId,
      createdBy: userId,
      name: input.name.trim().slice(0, 200),
      spec,
      depth,
      status: 'queued',
      stats: { companiesDiscovered: 0, candidatesFound: 0, pagesCrawled: 0, aiCalls: 0, errors: 0 },
      progress: { discovered: 0, processed: 0, qualified: 0, rejected: 0, failed: 0, total: cap },
    })
    .returning();

  await db.insert(researchTasks).values(
    RESEARCH_TASKS.map((type) => ({
      organizationId,
      jobId: row.id,
      type,
      status: 'pending' as const,
      // makes a retried enqueue a no-op instead of duplicating the task row
      idempotencyKey: `${row.id}:${type}`,
    })),
  );

  return row;
}

export async function listResearchJobs(organizationId: string, limit = 50): Promise<ResearchJob[]> {
  const db = getDb();
  return db
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.organizationId, organizationId))
    .orderBy(desc(researchJobs.createdAt))
    .limit(Math.min(limit, 200));
}

export async function getResearchJob(organizationId: string, jobId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(researchJobs)
    .where(and(eq(researchJobs.id, jobId), eq(researchJobs.organizationId, organizationId)))
    .limit(1);
  if (!job) throw new NotFoundError('Research job not found');

  const tasks = await db
    .select()
    .from(researchTasks)
    .where(and(eq(researchTasks.jobId, jobId), eq(researchTasks.organizationId, organizationId)));

  return { ...job, tasks };
}

export async function cancelResearchJob(organizationId: string, jobId: string): Promise<void> {
  const db = getDb();
  const job = await getResearchJob(organizationId, jobId);
  if (TERMINAL.includes(job.status)) {
    throw new ValidationError({ message: `Job is already ${job.status}` });
  }

  await db
    .update(researchJobs)
    .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(researchJobs.id, jobId), eq(researchJobs.organizationId, organizationId)));

  await db
    .update(researchTasks)
    .set({ status: 'skipped' })
    .where(
      and(
        eq(researchTasks.jobId, jobId),
        eq(researchTasks.organizationId, organizationId),
        inArray(researchTasks.status, ['pending', 'running']),
      ),
    );
}

export async function jobIsCancelled(jobId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ status: researchJobs.status })
    .from(researchJobs)
    .where(eq(researchJobs.id, jobId))
    .limit(1);
  return row?.status === 'cancelled';
}

export async function updateJobStatus(
  jobId: string,
  status: ResearchJobStatus,
  errorMessage?: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(researchJobs)
    .set({
      status,
      error: errorMessage ?? null,
      completedAt: TERMINAL.includes(status) ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(researchJobs.id, jobId));
}

export async function incrementJobStats(
  jobId: string,
  delta: Partial<ResearchJob['stats']>,
): Promise<void> {
  const db = getDb();
  // jsonb merge avoids a read-modify-write race between concurrent workers
  await db.execute(sql`
    UPDATE research_jobs
    SET stats = COALESCE(stats, '{}'::jsonb) || ${JSON.stringify(delta)}::jsonb,
        updated_at = now()
    WHERE id = ${jobId}::uuid
  `);
}

export async function listCandidates(
  organizationId: string,
  jobId: string,
  filters: { status?: string; minScore?: number; limit?: number },
) {
  const db = getDb();
  const conditions = [eq(leadCandidates.organizationId, organizationId), eq(leadCandidates.jobId, jobId)];
  if (filters.status) conditions.push(eq(leadCandidates.status, filters.status as never));
  if (filters.minScore !== undefined) conditions.push(sql`${leadCandidates.score} >= ${filters.minScore}`);

  return db
    .select()
    .from(leadCandidates)
    .where(and(...conditions))
    .orderBy(desc(leadCandidates.score))
    .limit(Math.min(filters.limit ?? 100, 500));
}

/** Section 28: a candidate is only trustworthy with the claims behind it attached. */
export async function getCandidate(organizationId: string, candidateId: string) {
  const db = getDb();
  const [candidate] = await db
    .select()
    .from(leadCandidates)
    .where(and(eq(leadCandidates.id, candidateId), eq(leadCandidates.organizationId, organizationId)))
    .limit(1);
  if (!candidate) throw new NotFoundError('Candidate not found');

  const scoped = and(
    eq(leadCandidates.organizationId, organizationId),
  );
  const [signals, evidence] = await Promise.all([
    db
      .select()
      .from(companySignals)
      .innerJoin(leadCandidates, eq(leadCandidates.id, companySignals.candidateId))
      .where(and(scoped, eq(companySignals.candidateId, candidateId)))
      .orderBy(desc(companySignals.detectedAt)),
    db
      .select()
      .from(leadEvidence)
      .innerJoin(leadCandidates, eq(leadCandidates.id, leadEvidence.candidateId))
      .where(and(scoped, eq(leadEvidence.candidateId, candidateId)))
      .orderBy(desc(leadEvidence.createdAt)),
  ]);

  return {
    ...candidate,
    signals: signals.map((s) => s.company_signals),
    evidence: evidence.map((e) => e.lead_evidence),
  };
}
