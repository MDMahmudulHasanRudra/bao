import { z } from 'zod';
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    API_URL: z.string().url().default('http://localhost:3000'),
    WEB_URL: z.string().url().default('http://localhost:3001'),
    DATABASE_URL: z.string().url(),
    DATABASE_SSL: z.coerce.boolean().default(false),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),
    SESSION_SECRET: z.string().min(32),
    STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
    STORAGE_BUCKET: z.string().default('business-ai-os'),
    STORAGE_ACCESS_KEY: z.string().min(1),
    STORAGE_SECRET_KEY: z.string().min(1),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
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
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
});
let _env = null;
export function loadEnv() {
    if (_env)
        return _env;
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
        throw new Error('Missing or invalid environment variables. Check .env.example.');
    }
    _env = result.data;
    return _env;
}
export function getEnv() {
    if (!_env)
        throw new Error('Environment not loaded. Call loadEnv() first.');
    return _env;
}
//# sourceMappingURL=index.js.map