import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function envBool(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : v === 'true' || v === '1'));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_URL: z.string().url().default('http://localhost:3000'),
  WEB_URL: z.string().url().default('http://localhost:3001'),

  DATABASE_URL: z.string().url(),
  // z.coerce.boolean() maps "false" → true; parse env strings explicitly
  DATABASE_SSL: envBool(false),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SESSION_SECRET: z.string().min(32),
  // AES-256-GCM key material for provider secrets (any ≥32-char string; derived via SHA-256)
  ENCRYPTION_KEY: z.string().min(32),

  STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
  STORAGE_BUCKET: z.string().default('business-ai-os'),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_FORCE_PATH_STYLE: envBool(true),

  AI_PROVIDER: z.string().default('openai'),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  AI_EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),

  PRESENTON_API_URL: z.string().url().optional(),
  PRESENTON_API_KEY: z.string().optional(),
  SCRAPLINK_API_URL: z.string().url().optional(),
  SCRAPLINK_API_KEY: z.string().optional(),
  DIFFY_API_URL: z.string().url().optional(),
  DIFFY_API_KEY: z.string().optional(),

  // --- Lead Intelligence: search ---
  // No search provider is configured by default; discovery then requires seed URLs.
  SEARCH_PROVIDER: z.string().optional(),
  SEARCH_API_KEY: z.string().optional(),

  // --- Lead Intelligence: crawler limits (§15/§81 — finite by default) ---
  CRAWLER_REQUEST_TIMEOUT: z.coerce.number().default(15000),
  CRAWLER_MAX_RESPONSE_SIZE: z.coerce.number().default(2_000_000),
  CRAWLER_MAX_DEPTH: z.coerce.number().default(2),
  CRAWLER_MAX_PAGES_PER_DOMAIN: z.coerce.number().default(10),
  CRAWLER_MAX_CONCURRENCY: z.coerce.number().default(4),
  CRAWLER_RATE_LIMIT_MS: z.coerce.number().default(1000),
  CRAWLER_USER_AGENT: z.string().default('BusinessAIOS/1.0 (+lead-intelligence)'),
  CRAWLER_RESPECT_ROBOTS: envBool(true),

  // --- Lead Intelligence: research cost control (§49) ---
  RESEARCH_MAX_COMPANIES: z.coerce.number().default(200),
  RESEARCH_MAX_QUERIES: z.coerce.number().default(8),
  RESEARCH_MAX_PAGES_PER_COMPANY: z.coerce.number().default(8),
  RESEARCH_MAX_AI_CALLS: z.coerce.number().default(500),
  RESEARCH_CACHE_TTL_SECONDS: z.coerce.number().default(86400),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;
let _dotenvLoaded = false;

function loadDotEnvFile(): void {
  if (_dotenvLoaded) return;
  _dotenvLoaded = true;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m || line.trimStart().startsWith('#')) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!(m[1] in process.env)) process.env[m[1]] = v;
      }
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}

export function loadEnv(): Env {
  if (_env) return _env;
  loadDotEnvFile();
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    throw new Error('Missing or invalid environment variables. Check .env.example.');
  }
  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('Environment not loaded. Call loadEnv() first.');
  return _env;
}
