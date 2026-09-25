import { z } from 'zod';
import type { DiscoverySpecification } from '@bao/contracts';
import { generateCompletion } from '../../integrations/ai-provider/adapter.js';

/** Only ever fed text the extractor already stripped - never raw HTML. */
export const MAX_CONTEXT_CHARS = 12_000;

const SIGNAL_TYPES = [
  'hiring', 'funding', 'expansion', 'new_product', 'technology_migration',
  'security_initiative', 'leadership_change', 'new_market', 'employee_growth', 'new_location',
] as const;

const classificationSchema = z.object({
  companyName: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  industry: z.string().max(100).optional(),
  subIndustry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  employeeMin: z.number().int().min(1).max(1_000_000).optional(),
  employeeMax: z.number().int().min(1).max(1_000_000).optional(),
  products: z.array(z.string().max(120)).max(20).default([]),
  services: z.array(z.string().max(120)).max(20).default([]),
  technologies: z.array(z.string().max(60)).max(30).default([]),
});

const analysisSchema = z.object({
  /** criterion -> match | unknown | no_match. 'unknown' is always allowed (section 29). */
  icpMatch: z.record(z.enum(['match', 'unknown', 'no_match'])).default({}),
  score: z.number().int().min(0).max(100),
  scoreReasons: z.array(z.string().max(300)).max(10).default([]),
  summary: z.string().max(1200).default(''),
  signals: z
    .array(
      z.object({
        type: z.enum(SIGNAL_TYPES),
        title: z.string().max(255),
        description: z.string().max(500).optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        // quote from the source text; required so a signal is never unsourced
        evidenceQuote: z.string().max(400).optional(),
      }),
    )
    .max(10)
    .default([]),
});

export type CompanyClassification = z.infer<typeof classificationSchema>;
export type CompanyAnalysis = z.infer<typeof analysisSchema>;

export class AiUnavailableError extends Error {}

async function ask(
  systemPrompt: string,
  userMessage: string,
  context: string,
  organizationId: string,
): Promise<string> {
  const result = await generateCompletion(systemPrompt, userMessage, context, organizationId);
  if (result.metadata.provider === 'unconfigured') throw new AiUnavailableError(result.content);
  return result.content;
}

/** Tolerates a fenced block and surrounding chatter; a hard parse failure still throws. */
export function parseJsonLoose(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('no JSON found in model output');
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (end <= start) throw new Error('unterminated JSON in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

const CLASSIFY_PROMPT = `You normalize a company profile from its own website text.
Return ONLY a JSON object, no prose, no markdown fence.

{"companyName"?:string,"description"?:string,"industry"?:string,"subIndustry"?:string,
 "country"?:string,"region"?:string,"city"?:string,
 "employeeMin"?:number,"employeeMax"?:number,
 "products":string[],"services":string[],"technologies":string[]}

Rules:
- Use ONLY what the text supports. Omit a field rather than guessing it.
- Never infer employee count from vague wording; omit unless a number is stated.
- products/services are short noun phrases, not sentences.
- technologies are named products or platforms only.`;

const ANALYZE_PROMPT = `You judge how well a company matches a seller's ideal customer profile.
Return ONLY a JSON object, no prose, no markdown fence.

{"icpMatch":{criterion:"match"|"unknown"|"no_match"},"score":0-100,
 "scoreReasons":string[],"summary":string,
 "signals":[{"type":string,"title":string,"description"?:string,"confidence"?:0-100,"evidenceQuote"?:string}]}

Rules:
- Use 'unknown' whenever the text does not settle a criterion. Never guess a match.
- score is 0-100 overall fit. It must be consistent with icpMatch and scoreReasons.
- scoreReasons must be short and specific, citing what in the text drove the score.
- summary is 2-3 sentences a salesperson can act on, grounded only in the text.
- Only report a signal the text actually shows. evidenceQuote must be copied verbatim
  from the supplied text. If you cannot quote it, do not report the signal.`;

export async function classifyCompany(
  organizationId: string,
  input: { companyName: string; website?: string; text: string },
): Promise<CompanyClassification> {
  const raw = await ask(
    CLASSIFY_PROMPT,
    `Company: ${input.companyName}\nWebsite: ${input.website ?? 'unknown'}\n\nNormalize this profile.`,
    input.text.slice(0, MAX_CONTEXT_CHARS),
    organizationId,
  );
  return classificationSchema.parse(parseJsonLoose(raw));
}

export async function analyzeCompany(
  organizationId: string,
  input: { companyName: string; website?: string; text: string; spec: DiscoverySpecification },
): Promise<CompanyAnalysis> {
  const criteria = {
    industries: input.spec.industries ?? [],
    geography: input.spec.geography ?? [],
    companySize: input.spec.companySize ?? null,
    technologies: input.spec.technologies ?? [],
    businessModels: input.spec.businessModels ?? [],
    targetService: input.spec.targetService ?? null,
    targetSignals: input.spec.targetSignals ?? [],
    customCriteria: input.spec.customCriteria ?? [],
  };

  const raw = await ask(
    ANALYZE_PROMPT,
    `Company: ${input.companyName}\nWebsite: ${input.website ?? 'unknown'}\n\n` +
      `Ideal customer profile:\n${JSON.stringify(criteria, null, 2)}\n\nJudge this company against it.`,
    input.text.slice(0, MAX_CONTEXT_CHARS),
    organizationId,
  );

  const analysis = analysisSchema.parse(parseJsonLoose(raw));
  return pruneUnquotableSignals(analysis, input.text);
}

/** A signal with no verbatim quote is a hallucination risk, so it is dropped, not stored. */
export function pruneUnquotableSignals(analysis: CompanyAnalysis, sourceText: string): CompanyAnalysis {
  const haystack = sourceText.toLowerCase().replace(/\s+/g, ' ');
  return {
    ...analysis,
    signals: analysis.signals.filter((signal) => {
      if (!signal.evidenceQuote) return false;
      return haystack.includes(signal.evidenceQuote.toLowerCase().replace(/\s+/g, ' ').trim());
    }),
  };
}

export function suggestedStatus(analysis: CompanyAnalysis): 'qualified' | 'review_required' | 'discovered' {
  if (analysis.score >= 70) return 'qualified';
  if (analysis.score >= 40) return 'review_required';
  return 'discovered';
}
