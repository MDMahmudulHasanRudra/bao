import type { DiscoverySpecification, WebDocumentData } from '@bao/contracts';
import { Queue } from 'bullmq';
import { loadEnv } from '@bao/config';
import { getSql } from '../ingest.js';
import { getRedis } from '../redis.js';
import { getLogger } from '../logger.js';
import { crawlManyWithFallback } from './crawler-provider.js';
import { httpSearchProvider, searchConfigured } from './search.js';
import { generateQueries } from './queries.js';
import { normalizedDomain, normalizeUrl } from './extract.js';

const env = loadEnv();
const log = getLogger('research-job');

const ANALYSIS_QUEUE = 'lead-intelligence-analyze';

interface JobRow {
  id: string;
  organization_id: string;
  spec: DiscoverySpecification;
  status: string;
}

const EXCLUDED_SUFFIXES = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.zip', '.doc', '.docx', '.xls', '.xlsx'];

/** Aggregator/directory pages are not companies, so they never become candidates. */
const DIRECTORY_HOSTS = [
  'wikipedia.org', 'crunchbase.com', 'linkedin.com', 'facebook.com', 'x.com', 'twitter.com',
  'instagram.com', 'youtube.com', 'medium.com', 'reddit.com', 'glassdoor.com', 'indeed.com',
  'yelp.com', 'bloomberg.com', 'zoominfo.com', 'apollo.io', 'g2.com', 'capterra.com',
  'trustpilot.com', 'amazon.com', 'alibaba.com', 'github.com', 'gitlab.com', 'stackoverflow.com',
];

async function loadJob(jobId: string): Promise<JobRow | undefined> {
  const sql = getSql();
  const rows = await sql<JobRow[]>`
    SELECT id, organization_id, spec, status
    FROM research_jobs WHERE id = ${jobId}::uuid
  `;
  return rows[0];
}

async function setStatus(jobId: string, status: string, error?: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE research_jobs
    SET status = ${status},
        error = ${error ?? null},
        completed_at = CASE WHEN ${status} IN ('completed','failed','cancelled') THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

async function bumpStats(jobId: string, delta: Record<string, number>): Promise<void> {
  await getSql()`
    UPDATE research_jobs
    SET stats = COALESCE(stats, '{}'::jsonb) || ${JSON.stringify(delta)}::jsonb,
        updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

async function completeTask(
  jobId: string,
  organizationId: string,
  type: string,
  target: string | null,
  status: 'completed' | 'failed' | 'skipped',
  error?: string,
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE research_tasks
    SET status = ${status}, target = ${target}, error = ${error ?? null},
        completed_at = now(), updated_at = now()
    WHERE job_id = ${jobId}::uuid AND organization_id = ${organizationId}::uuid AND type = ${type}
  `;
}

function isUsableCompanyUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (EXCLUDED_SUFFIXES.some((s) => url.pathname.toLowerCase().endsWith(s))) return false;
    const domain = url.hostname.replace(/^www\./, '');
    if (DIRECTORY_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`))) return false;
    return Boolean(normalizedDomain(domain));
  } catch {
    return false;
  }
}

/** Section 12: seed URLs when given, otherwise web search; both are bounded. */
async function discoverDomains(job: JobRow): Promise<string[]> {
  const spec = job.spec;
  const cap = spec.limit || env.RESEARCH_MAX_COMPANIES;
  const excluded = new Set((spec.excludeDomains ?? []).map((d) => d.toLowerCase()));
  const found = new Map<string, string>();

  const add = (raw: string) => {
    if (!isUsableCompanyUrl(raw)) return;
    const domain = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
    if (excluded.has(domain) || found.has(domain)) return;
    found.set(domain, `https://${domain}`);
  };

  for (const seed of []) add(seed);
  for (const seed of spec.seedDomains ?? []) add(seed);

  if (found.size < cap && searchConfigured()) {
    for (const query of generateQueries(spec, env.RESEARCH_MAX_QUERIES)) {
      if (found.size >= cap) break;
      const results = await httpSearchProvider.search(query, { limit: 10, country: spec.geography?.[0] });
      for (const result of results) {
        if (found.size >= cap) break;
        add(result.url);
      }
    }
  }

  if (found.size === 0) {
    log.warn(
      { jobId: job.id, searchConfigured: searchConfigured(), seeds: (job.spec.seedDomains ?? []).length },
      'no companies discovered; set seed domains or configure a search provider',
    );
  }
  return [...found.values()].slice(0, cap);
}

async function persistCandidate(
  job: JobRow,
  domain: string,
  docs: WebDocumentData[],
): Promise<string | null> {
  const sql = getSql();
  const best = docs.find((d) => d.status === 'success' && d.title) ?? docs.find((d) => d.status === 'success');
  if (!best) return null;

  // dedupe on (org, domain): a retried job updates the existing candidate
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM lead_candidates
    WHERE organization_id = ${job.organization_id}::uuid
      AND normalized_domain = ${domain}
    LIMIT 1
  `;

  const name = (best.title || domain).replace(/\s*[|\-–—]\s*[^|\-–—]{0,30}$/, '').trim() || domain;
  const provenance: Record<string, string[]> = { companyName: [best.url] };

  if (existing[0]) {
    await sql`
      UPDATE lead_candidates
      SET company_name = ${name.slice(0, 255)},
          -- ponytail: a candidate is owned by the newest job that found it. A job_candidates
          -- join table is the correct model once one candidate must appear under several jobs.
          job_id = ${job.id}::uuid,
          website = ${best.canonicalUrl || best.url},
          description = COALESCE(${best.description ?? null}, description),
          social_links = ${JSON.stringify(best.socialLinks)}::jsonb,
          provenance = provenance || ${JSON.stringify(provenance)}::jsonb,
          updated_at = now()
      WHERE id = ${existing[0].id}::uuid
    `;
    return existing[0].id;
  }

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO lead_candidates
      (organization_id, job_id, company_name, normalized_domain, website, description,
       social_links, provenance, status)
    VALUES (
      ${job.organization_id}::uuid, ${job.id}::uuid, ${name.slice(0, 255)}, ${domain},
      ${best.canonicalUrl || best.url}, ${best.description ?? null},
      ${JSON.stringify(best.socialLinks)}::jsonb, ${JSON.stringify(provenance)}::jsonb, 'discovered'
    )
    ON CONFLICT (organization_id, normalized_domain) DO UPDATE
      SET updated_at = now()
      RETURNING id
  `;
  return inserted[0]?.id ?? null;
}

async function persistDocuments(
  job: JobRow,
  domain: string,
  docs: WebDocumentData[],
): Promise<{ documentIds: string[]; sourceIds: string[] }> {
  const sql = getSql();
  const documentIds: string[] = [];
  const sourceIds: string[] = [];

  for (const doc of docs) {
    let normalized: string;
    try {
      normalized = normalizeUrl(doc.url);
    } catch {
      continue;
    }

    // one source per normalized URL per org: a retried crawl must not duplicate it
    const [source] = await sql<{ id: string }[]>`
      INSERT INTO research_sources
        (organization_id, job_id, source_type, provider, url, normalized_url, title,
         status, content_hash, error, retrieved_at, metadata)
      VALUES (
        ${job.organization_id}::uuid, ${job.id}::uuid, 'website', ${doc.provider ?? 'internal'},
        ${doc.url}, ${normalized}, ${doc.title ?? null}, ${doc.status},
        ${doc.contentHash || null}, ${doc.error ?? null},
        ${doc.retrievedAt}::timestamptz, ${JSON.stringify({ domain })}::jsonb
      )
      ON CONFLICT (organization_id, normalized_url) DO UPDATE
        SET status = EXCLUDED.status,
            content_hash = EXCLUDED.content_hash,
            error = EXCLUDED.error,
            retrieved_at = EXCLUDED.retrieved_at
        RETURNING id
    `;
    if (!source) continue;
    sourceIds.push(source.id);
    if (doc.status !== 'success' || !doc.content) continue;

    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO web_documents
        (organization_id, source_id, url, canonical_url, title, description, headings, content,
         language, links, emails, phones, social_links, content_hash, extracted_by)
      VALUES (
        ${job.organization_id}::uuid, ${source.id}::uuid, ${doc.url}, ${doc.canonicalUrl ?? null},
        ${doc.title ?? null}, ${doc.description ?? null}, ${JSON.stringify(doc.headings)}::jsonb,
        ${doc.content}, ${doc.language ?? null}, ${JSON.stringify(doc.links)}::jsonb,
        ${JSON.stringify(doc.emails)}::jsonb, ${JSON.stringify(doc.phones)}::jsonb,
        ${JSON.stringify(doc.socialLinks)}::jsonb, ${doc.contentHash}, ${doc.provider ?? 'internal'}
      )
      ON CONFLICT (source_id) DO UPDATE
        SET content = EXCLUDED.content,
            content_hash = EXCLUDED.content_hash,
            title = EXCLUDED.title,
            description = EXCLUDED.description
        RETURNING id
    `;
    if (inserted) documentIds.push(inserted.id);
  }

  return { documentIds, sourceIds };
}

/** Section 28: every normalized value must be traceable to a page, or it is not a fact. */
async function attachEvidence(
  job: JobRow,
  candidateId: string,
  documentIds: string[],
  sourceIds: string[],
  domain: string,
): Promise<void> {
  if (documentIds.length === 0) return;
  const sql = getSql();
  const rows = await sql<{ id: string; title: string | null; content: string; source_id: string; url: string }[]>`
    SELECT id, title, content, source_id, url FROM web_documents
    WHERE organization_id = ${job.organization_id}::uuid
      AND id = ANY(${documentIds}::uuid[])
    LIMIT 5
  `;

  for (const row of rows) {
    const sourceId = sourceIds.find((id) => id === row.source_id) ?? row.source_id;
    await sql`
      INSERT INTO lead_evidence
        (organization_id, candidate_id, document_id, source_id, claim, snippet, source_url, retrieved_at)
      VALUES (
        ${job.organization_id}::uuid, ${candidateId}::uuid, ${row.id}::uuid, ${sourceId}::uuid,
        ${`Page content from ${row.title || domain}`},
        ${row.content.slice(0, 500)}, ${row.url}, now()
      )
    `;
  }
}

async function enqueueAnalysis(jobId: string): Promise<void> {
  const queue = new Queue(ANALYSIS_QUEUE, { connection: getRedis() });
  await queue.add('analyze', { jobId }, { attempts: 3, backoff: { type: 'exponential', delay: 10_000 } });
  await queue.close();
}

/**
 * I/O-bound half of the pipeline: discover companies, crawl them, store raw evidence.
 * The AI stages run in the API process (it holds decrypted tenant provider keys) and
 * are handed off through the analysis queue.
 */
export async function processResearchJob(data: { jobId: string }): Promise<void> {
  const { jobId } = data;
  const job = await loadJob(jobId);
  if (!job) throw new Error(`Research job ${jobId} not found`);
  if (job.status === 'cancelled') {
    log.info({ jobId }, 'job cancelled before start');
    return;
  }

  await setStatus(jobId, 'discovering');
  await completeTask(jobId, job.organization_id, 'discovery', null, 'completed');

  const domains = await discoverDomains(job);
  await bumpStats(jobId, { companiesDiscovered: domains.length });
  log.info({ jobId, companies: domains.length }, 'discovery complete');

  let candidates = 0;
  let pages = 0;
  let errors = 0;

  for (const domain of domains) {
    const sql = getSql();
    const live = await sql<{ status: string }[]>`
      SELECT status FROM research_jobs WHERE id = ${jobId}::uuid
    `;
    if (live[0]?.status === 'cancelled') {
      log.info({ jobId }, 'cancelled mid-run');
      return;
    }

    // One domain must never abort the run: the crawlers already return failed
    // documents, and this catches anything else (DNS, storage, a persistence error).
    let docs: WebDocumentData[];
    try {
      docs = await crawlManyWithFallback(domain, { maxPages: env.RESEARCH_MAX_PAGES_PER_COMPANY });
    } catch (err) {
      const message = (err as Error).message;
      log.warn({ domain, error: message }, 'crawl threw, isolating domain');
      await completeTask(jobId, job.organization_id, 'fetch', domain, 'failed', message);
      errors++;
      continue;
    }

    pages += docs.length;
    const successful = docs.filter((d) => d.status === 'success');
    await completeTask(
      jobId, job.organization_id, 'fetch', domain,
      successful.length > 0 ? 'completed' : 'failed',
      successful.length > 0 ? undefined : 'No page could be retrieved',
    );
    if (successful.length === 0) {
      errors++;
      continue;
    }

    try {
      const { documentIds, sourceIds } = await persistDocuments(job, domain, docs);
      const candidateId = await persistCandidate(job, domain, docs);
      if (candidateId) {
        await attachEvidence(job, candidateId, documentIds, sourceIds, domain);
        candidates++;
      }
    } catch (err) {
      log.warn({ domain, error: (err as Error).message }, 'persistence failed for domain');
      errors++;
    }
  }

  await bumpStats(jobId, { candidatesFound: candidates, pagesCrawled: pages, errors });
  await completeTask(jobId, job.organization_id, 'normalize', null, 'completed');
  await completeTask(jobId, job.organization_id, 'deduplicate', null, 'completed');
  await completeTask(jobId, job.organization_id, 'evidence', null, 'completed');

  if (candidates === 0) {
    await setStatus(jobId, 'failed', 'No company pages could be retrieved. Add seed domains or configure a search provider.');
    return;
  }

  await setStatus(jobId, 'analyzing');
  await enqueueAnalysis(jobId);
  log.info({ jobId, candidates, pages }, 'crawl phase complete, analysis enqueued');
}
