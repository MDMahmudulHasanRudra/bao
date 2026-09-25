import { z } from 'zod';
import type { DiscoveryPlanResult } from '@bao/contracts';
import { generateCompletion } from '../../integrations/ai-provider/adapter.js';

/** Section 27: the same rules the database enforces, applied before anything is saved. */
const discoverySpecificationSchema = z.object({
  objective: z.string().max(500).optional(),
  industries: z.array(z.string().min(1).max(80)).max(10).default([]),
  subIndustries: z.array(z.string().min(1).max(80)).max(10).default([]),
  geography: z.array(z.string().min(1).max(80)).max(10).default([]),
  companySize: z
    .object({
      min: z.number().int().min(1).max(1_000_000).optional(),
      max: z.number().int().min(1).max(1_000_000).optional(),
    })
    .optional(),
  technologies: z.array(z.string().min(1).max(60)).max(30).default([]),
  businessModels: z.array(z.string().min(1).max(80)).max(20).default([]),
  targetService: z.string().max(200).optional(),
  keywords: z.array(z.string().min(1).max(80)).max(30).default([]),
  targetSignals: z.array(z.string().min(1).max(120)).max(20).default([]),
  customCriteria: z.array(z.string().max(200)).max(20).default([]),
  seedDomains: z.array(z.string().max(255)).max(50).default([]),
  excludeDomains: z.array(z.string().max(255)).max(100).default([]),
  locales: z.array(z.string().max(10)).max(10).default([]),
  limit: z.number().int().min(1).max(1000),
});

const PLAN_PROMPT = `You turn a sales-research request into a precise discovery specification.
Return ONLY a JSON object, no prose, no markdown fence.

Schema:
{"objective":string,"industries":string[],"subIndustries":string[],"geography":string[],
 "companySize":{"min"?:number,"max"?:number},"technologies":string[],"businessModels":string[],
 "targetService"?:string,"keywords":string[],"targetSignals":string[],"customCriteria":string[],
 "seedDomains":string[],"excludeDomains":string[],"locales":string[],"limit":number}

Rules:
- Prefer specific industries over broad ones (e.g. "commercial HVAC contractors", not "HVAC").
- companySize is an employee range. Omit it if the request does not imply one.
- targetSignals are observable facts on a website (funding, hiring, tech stack, certifications, expansion).
- Never invent seed domains. Leave the array empty unless the user supplied domains.
- limit is how many companies to research; never exceed the limit you were given.
- Omit optional fields you cannot infer. Use empty arrays for unknown lists.`;

function parseJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(candidate);
}

/** Section 9: a failed plan is reported, never silently replaced with a guess. */
export async function buildDiscoveryPlan(
  organizationId: string,
  request: string,
  maxCompanies: number,
): Promise<DiscoveryPlanResult> {
  const result = await generateCompletion(
    PLAN_PROMPT,
    `Research request: ${request}\n\nMaximum companies to research: ${maxCompanies}`,
    undefined,
    organizationId,
  );

  if (result.metadata.provider === 'unconfigured') {
    return { status: 'unconfigured', message: result.content };
  }

  let parsed: unknown;
  try {
    parsed = parseJson(result.content);
  } catch {
    return { status: 'validation_error', message: 'The AI provider did not return valid JSON.' };
  }

  const safe = discoverySpecificationSchema.safeParse(parsed);
  if (!safe.success) {
    return {
      status: 'validation_error',
      message: safe.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }

  if (safe.data.companySize?.min && safe.data.companySize.max && safe.data.companySize.min > safe.data.companySize.max) {
    return { status: 'validation_error', message: 'companySize.min cannot exceed companySize.max' };
  }

  return {
    status: 'success',
    specification: { ...safe.data, limit: Math.min(safe.data.limit, maxCompanies) },
  };
}
