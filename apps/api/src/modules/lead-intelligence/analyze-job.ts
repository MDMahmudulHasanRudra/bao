import { and, eq, inArray } from 'drizzle-orm';
import { ZodError } from 'zod';
import { loadEnv } from '@bao/config';
import { getDb } from '../../db/index.js';
import {
  companySignals,
  leadCandidates,
  leadEvidence,
  researchJobs,
  researchTasks,
  researchSources,
  webDocuments,
} from '../../db/schema.js';
import { createChildLogger } from '../../core/logging/logger.js';
import {
  incrementJobStats,
  jobIsCancelled,
  updateJobStatus,
  type ResearchTaskType,
} from './service.js';
import {
  AiUnavailableError,
  MAX_CONTEXT_CHARS,
  analyzeCompany,
  classifyCompany,
  suggestedStatus,
} from './analysis.js';

const env = loadEnv();
const log = createChildLogger('lead-intelligence:analyze');

const CLASSIFY_TASKS: ResearchTaskType[] = ['classify', 'enrichment'];
const ANALYZE_TASKS: ResearchTaskType[] = [
  'signal_detection',
  'icp_score',
  'qualification',
  'evidence',
  'summary',
];

/** Raised when the per-job AI spend cap is hit. Terminal: retrying cannot spend more. */
class BudgetExhausted extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

async function setTasks(
  organizationId: string,
  jobId: string,
  types: ResearchTaskType[],
  status: 'running' | 'completed' | 'failed' | 'skipped',
): Promise<void> {
  await getDb()
    .update(researchTasks)
    .set({ status, ...(status === 'completed' ? { completedAt: new Date() } : {}) })
    .where(
      and(
        eq(researchTasks.jobId, jobId),
        eq(researchTasks.organizationId, organizationId),
        inArray(researchTasks.type, types),
      ),
    );
}

/**
 * Section 55: one bounded AI pass per candidate, then persist. Every candidate is written
 * before moving on, so a mid-run failure never discards completed work.
 */
export async function processAnalysis(data: Record<string, unknown>): Promise<void> {
  const jobId = String(data.jobId ?? '');
  if (!UUID.test(jobId)) throw new Error('invalid jobId in analysis payload');

  const db = getDb();
  const [job] = await db.select().from(researchJobs).where(eq(researchJobs.id, jobId)).limit(1);
  if (!job) {
    log.warn({ jobId }, 'analysis for unknown job, skipping');
    return;
  }
  if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') {
    log.info({ jobId, status: job.status }, 'analysis skipped, job already terminal');
    return;
  }

  const { organizationId, spec } = job;
  const candidates = await db
    .select()
    .from(leadCandidates)
    .where(and(eq(leadCandidates.jobId, jobId), eq(leadCandidates.organizationId, organizationId)));

  if (candidates.length === 0) {
    await updateJobStatus(jobId, 'completed');
    return;
  }

  // One query for the whole job, grouped in memory: documents are already bounded by the
  // crawl phase, and a per-candidate query would be N round trips for the same rows.
  const documents = await db
    .select({
      id: webDocuments.id,
      sourceId: webDocuments.sourceId,
      url: webDocuments.url,
      title: webDocuments.title,
      content: webDocuments.content,
    })
    .from(webDocuments)
    .innerJoin(researchSources, eq(researchSources.id, webDocuments.sourceId))
    .where(
      and(
        eq(researchSources.jobId, jobId),
        eq(researchSources.organizationId, organizationId),
        eq(researchSources.status, 'success'),
      ),
    );

  const byHost = new Map<string, typeof documents>();
  for (const doc of documents) {
    const host = hostOf(doc.url);
    if (!host) continue;
    const bucket = byHost.get(host);
    if (bucket) bucket.push(doc);
    else byHost.set(host, [doc]);
  }

  await updateJobStatus(jobId, 'analyzing');
  await setTasks(organizationId, jobId, [...CLASSIFY_TASKS, ...ANALYZE_TASKS], 'running');

  // Bounded spend. Two calls per candidate: one extraction, one judgement.
  let calls = 0;
  const budget = env.RESEARCH_MAX_AI_CALLS;
  const spend = (): void => {
    if (++calls > budget) {
      throw new BudgetExhausted(
        `AI call budget exhausted (${budget} calls) - raise RESEARCH_MAX_AI_CALLS or lower the job limit`,
      );
    }
  };

  const analyzed: typeof candidates = [];
  let errors = 0;

  try {
    for (const candidate of candidates) {
      if (await jobIsCancelled(jobId)) {
        await setTasks(organizationId, jobId, [...CLASSIFY_TASKS, ...ANALYZE_TASKS], 'skipped');
        await updateJobStatus(jobId, 'cancelled');
        return;
      }

      const docs = byHost.get(candidate.normalizedDomain ?? '') ?? [];
      const text = docs
        .map((d) => `${d.title ?? d.url}\n${d.content}`)
        .join('\n\n')
        .slice(0, MAX_CONTEXT_CHARS);
      if (text.trim().length < 200) {
        errors += 1;
        continue;
      }

      spend();
      const profile = await classifyCompany(organizationId, {
        companyName: candidate.companyName,
        website: candidate.website ?? undefined,
        text,
      });
      await db
        .update(leadCandidates)
        .set({
          // existing crawl values win; the model only fills what is still unknown
          companyName: profile.companyName ?? candidate.companyName,
          description: profile.description ?? candidate.description,
          industry: profile.industry ?? candidate.industry,
          subIndustry: profile.subIndustry ?? candidate.subIndustry,
          country: profile.country ?? candidate.country,
          region: profile.region ?? candidate.region,
          city: profile.city ?? candidate.city,
          employeeMin: profile.employeeMin ?? candidate.employeeMin,
          employeeMax: profile.employeeMax ?? candidate.employeeMax,
          products: profile.products.length ? profile.products : candidate.products,
          services: profile.services.length ? profile.services : candidate.services,
          technologies: profile.technologies.length ? profile.technologies : candidate.technologies,
          updatedAt: new Date(),
        })
        .where(eq(leadCandidates.id, candidate.id));
    }
    await setTasks(organizationId, jobId, CLASSIFY_TASKS, 'completed');

    for (const candidate of candidates) {
      if (await jobIsCancelled(jobId)) {
        await setTasks(organizationId, jobId, ANALYZE_TASKS, 'skipped');
        await updateJobStatus(jobId, 'cancelled');
        return;
      }

      const docs = byHost.get(candidate.normalizedDomain ?? '') ?? [];
      const text = docs
        .map((d) => `${d.title ?? d.url}\n${d.content}`)
        .join('\n\n')
        .slice(0, MAX_CONTEXT_CHARS);
      if (text.trim().length < 200) continue;

      spend();
      const analysis = await analyzeCompany(organizationId, {
        companyName: candidate.companyName,
        website: candidate.website ?? undefined,
        text,
        spec,
      });

      await db
        .update(leadCandidates)
        .set({
          score: analysis.score,
          scoreReasons: analysis.scoreReasons,
          icpMatch: analysis.icpMatch,
          summary: analysis.summary,
          status: suggestedStatus(analysis),
          updatedAt: new Date(),
        })
        .where(eq(leadCandidates.id, candidate.id));

      // Section 28: every persisted claim keeps a pointer back to the page it came from.
      // The score is a judgement over all pages, so it cites the strongest reason's page.
      const reasonsDoc = sourceForQuote(analysis.scoreReasons.join(' '), docs) ?? docs[0];
      if (reasonsDoc) {
        await db.insert(leadEvidence).values({
          organizationId,
          candidateId: candidate.id,
          documentId: reasonsDoc.id,
          sourceId: reasonsDoc.sourceId,
          claim: `ICP fit scored ${analysis.score}/100`,
          snippet: analysis.scoreReasons.join(' | ') || analysis.summary,
          sourceUrl: reasonsDoc.url,
          retrievedAt: new Date(),
        });
      }

      for (const signal of analysis.signals) {
        // Credit the page the quote actually came from, not whichever page is first.
        const origin = sourceForQuote(signal.evidenceQuote, docs);
        await db.insert(companySignals).values({
          organizationId,
          candidateId: candidate.id,
          type: signal.type,
          title: signal.title,
          description: signal.description,
          confidence: signal.confidence,
          sourceUrl: origin?.url,
          metadata: { evidenceQuote: signal.evidenceQuote },
        });
        if (origin) {
          await db.insert(leadEvidence).values({
            organizationId,
            candidateId: candidate.id,
            documentId: origin.id,
            sourceId: origin.sourceId,
            claim: signal.title,
            snippet: signal.evidenceQuote ?? signal.description,
            sourceUrl: origin.url,
            retrievedAt: new Date(),
          });
        }
      }

      analyzed.push({ ...candidate, score: analysis.score });
    }
    await setTasks(organizationId, jobId, ANALYZE_TASKS, 'completed');
  } catch (err) {
    const terminal =
      err instanceof BudgetExhausted ||
      err instanceof AiUnavailableError ||
      err instanceof ZodError;
    if (!terminal) throw err;

    log.error({ jobId, err: err.message }, 'analysis failed permanently');
    await setTasks(organizationId, jobId, [...CLASSIFY_TASKS, ...ANALYZE_TASKS], 'failed');
    await incrementJobStats(jobId, { aiCalls: calls, errors: errors + 1 });
    await updateJobStatus(jobId, 'failed', err.message);
    return;
  }

  const qualified = analyzed.filter((c) => (c.score ?? 0) >= 70).length;
  await getDb()
    .update(researchJobs)
    .set({
      progress: {
        discovered: candidates.length,
        processed: analyzed.length,
        qualified,
        rejected: 0,
        failed: errors,
        total: candidates.length,
      },
      updatedAt: new Date(),
    })
    .where(eq(researchJobs.id, jobId));

  await incrementJobStats(jobId, { aiCalls: calls, errors, candidatesFound: analyzed.length });
  await updateJobStatus(jobId, 'completed');
  log.info({ jobId, candidates: analyzed.length, qualified, aiCalls: calls }, 'analysis complete');
}

type QuoteDoc = { id: string; sourceId: string; url: string; content: string };

/**
 * The AI reads one blob assembled from every page, so a verbatim quote can come from
 * any of them. Credit the page that actually contains the quote, so the evidence link
 * does not point somewhere the claim was never made. Whitespace is normalized because
 * the model is free to reflow the text it was given.
 */
export function sourceForQuote<T extends QuoteDoc>(quote: string | null | undefined, docs: T[]): T | undefined {
  const needle = collapse(quote ?? '');
  if (!needle) return docs[0];
  const found = docs.find((d) => collapse(d.content).includes(needle));
  if (found) return found;

  // The model may have trimmed or appended text around the real quote. Try each
  // sentence, then progressively shorter leading windows, before giving up. 30 chars is
  // the floor: shorter probes would match any page and misattribute the claim.
  const probes = [
    ...needle.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 25),
    needle.slice(0, 60),
    needle.slice(0, 30),
  ];

  for (const probe of probes) {
    const hit = docs.find((d) => collapse(d.content).includes(collapse(probe)));
    if (hit) return hit;
  }
  return docs[0];
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
