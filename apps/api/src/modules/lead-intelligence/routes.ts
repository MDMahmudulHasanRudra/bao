import { Hono } from 'hono';
import { z } from 'zod';
import { loadEnv } from '@bao/config';
import { ValidationError } from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import { buildDiscoveryPlan } from './planner.js';
import {
  cancelResearchJob,
  createResearchJob,
  getCandidate,
  getResearchJob,
  listCandidates,
  listResearchJobs,
} from './service.js';
import { enqueueResearchJob } from './dispatch.js';
import { promoteCandidate } from './promote.js';

const env = loadEnv();
const leadIntelligence = new Hono();
const READ = requirePermission('lead-intelligence.read');
const RUN = requirePermission('lead-intelligence.run');
const REVIEW = requirePermission('lead-intelligence.review');

const specSchema = z.object({
  objective: z.string().max(500).optional(),
  industries: z.array(z.string().max(80)).max(10).optional(),
  subIndustries: z.array(z.string().max(80)).max(10).optional(),
  geography: z.array(z.string().max(80)).max(10).optional(),
  companySize: z.object({ min: z.number().int().min(1).optional(), max: z.number().int().min(1).optional() }).optional(),
  technologies: z.array(z.string().max(60)).max(30).optional(),
  businessModels: z.array(z.string().max(80)).max(20).optional(),
  targetService: z.string().max(200).optional(),
  keywords: z.array(z.string().max(80)).max(30).optional(),
  targetSignals: z.array(z.string().max(120)).max(20).optional(),
  customCriteria: z.array(z.string().max(200)).max(20).optional(),
  seedDomains: z.array(z.string().max(255)).max(50).optional(),
  excludeDomains: z.array(z.string().max(255)).max(100).optional(),
  locales: z.array(z.string().max(10)).max(10).optional(),
  limit: z.number().int().min(1).max(env.RESEARCH_MAX_COMPANIES),
});

const createBody = z.object({
  name: z.string().min(1).max(200).optional(),
  /** Natural language request; required when `spec` is absent. */
  request: z.string().min(1).max(4000).optional(),
  spec: specSchema.optional(),
  depth: z.enum(['light', 'standard', 'deep']).optional(),
  seedUrls: z.array(z.string().max(500)).max(50).optional(),
});

const planBody = z.object({ request: z.string().min(1).max(4000) });

function zodToValidationError(error: z.ZodError): ValidationError {
  return new ValidationError(
    Object.fromEntries(error.issues.map((i) => [i.path.join('.') || '_root', i.message])),
  );
}

leadIntelligence.get('/jobs', READ, async (c) => {
  const tenant = getTenant(c);
  return c.json({ jobs: await listResearchJobs(tenant.organizationId) });
});

leadIntelligence.post('/jobs/plan', RUN, async (c) => {
  const tenant = getTenant(c);
  const parsed = planBody.safeParse(await c.req.json());
  if (!parsed.success) throw zodToValidationError(parsed.error);

  const result = await buildDiscoveryPlan(
    tenant.organizationId,
    parsed.data.request,
    env.RESEARCH_MAX_COMPANIES,
  );
  if (result.status !== 'success') {
    return c.json(result, result.status === 'unconfigured' ? 503 : 422);
  }
  return c.json(result);
});

leadIntelligence.post('/jobs', RUN, async (c) => {
  const tenant = getTenant(c);
  const parsed = createBody.safeParse(await c.req.json());
  if (!parsed.success) throw zodToValidationError(parsed.error);
  if (!parsed.data.spec && !parsed.data.request) {
    throw new ValidationError({ request: 'Provide either a natural language request or an explicit spec' });
  }

  const spec = parsed.data.spec ??
    (await buildDiscoveryPlan(tenant.organizationId, parsed.data.request!, env.RESEARCH_MAX_COMPANIES));
  if ('status' in spec) {
    return c.json(spec, spec.status === 'unconfigured' ? 503 : 422);
  }

  const job = await createResearchJob(tenant.organizationId, tenant.userId, {
    name: parsed.data.name || parsed.data.request?.slice(0, 80) || 'Lead research',
    spec,
    depth: parsed.data.depth ?? 'standard',
    seedUrls: parsed.data.seedUrls,
  });


  await audit(c, 'research_job.created', 'research_job', job.id, {
    name: job.name,
    limit: spec.limit,
    depth: job.depth,
  });
  await enqueueResearchJob(job.id);

  return c.json({ job }, 201);
});

leadIntelligence.get('/jobs/:id', READ, async (c) => {
  const tenant = getTenant(c);
  return c.json({ job: await getResearchJob(tenant.organizationId, c.req.param('id')) });
});

leadIntelligence.post('/jobs/:id/cancel', RUN, async (c) => {
  const tenant = getTenant(c);
  await cancelResearchJob(tenant.organizationId, c.req.param('id'));
  await audit(c, 'research_job.cancelled', 'research_job', c.req.param('id'));
  return c.json({ ok: true });
});

leadIntelligence.get('/jobs/:id/candidates', READ, async (c) => {
  const tenant = getTenant(c);
  const q = c.req.query();
  return c.json({
    candidates: await listCandidates(tenant.organizationId, c.req.param('id'), {
      status: q.status,
      minScore: q.minScore === undefined ? undefined : Number(q.minScore),
      limit: q.limit === undefined ? undefined : Number(q.limit),
    }),
  });
});

leadIntelligence.get('/candidates/:id', READ, async (c) => {
  const tenant = getTenant(c);
  return c.json({ candidate: await getCandidate(tenant.organizationId, c.req.param('id')) });
});

leadIntelligence.post('/candidates/:id/promote', REVIEW, async (c) =>
  c.json(await promoteCandidate(c, c.req.param('id'))),
);

export default leadIntelligence;