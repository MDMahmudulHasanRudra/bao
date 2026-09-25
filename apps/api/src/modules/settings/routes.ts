import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/index.js';
import { organizations, aiProviders } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { getEnv } from '../../core/config/env.js';
import { audit } from '../audit/service.js';

const settings = new Hono();

/**
 * C4: organizations.settings accepts a known shape only —
 * unknown keys and wrong types are rejected (not silently stripped).
 */
export const orgSettingsSchema = z
  .object({
    companyName: z.string().min(1).max(255).optional(),
    industry: z.string().max(255).optional(),
    website: z.union([z.string().url(), z.literal('')]).optional(),
    timezone: z.string().max(64).optional(),
    currency: z.string().min(3).max(8).optional(),
    defaultLeadValue: z.number().int().nonnegative().optional(),
    notificationEmail: z.union([z.string().email(), z.literal('')]).optional(),
  })
  .strict();

settings.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, tenant.organizationId))
    .limit(1);

  if (!org) throw new NotFoundError('Organization');

  return c.json({ settings: org.settings || {} });
});

settings.put('/', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{ settings: unknown }>().catch(() => null);

  if (
    !body ||
    typeof body.settings !== 'object' ||
    body.settings === null ||
    Array.isArray(body.settings)
  ) {
    throw new ValidationError({ settings: 'settings object is required' });
  }

  const parsed = orgSettingsSchema.safeParse(body.settings);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'settings';
      details[key] = issue.message;
    }
    throw new ValidationError(details);
  }

  const [updated] = await db
    .update(organizations)
    .set({ settings: parsed.data, updatedAt: new Date() })
    .where(eq(organizations.id, tenant.organizationId))
    .returning();

  if (!updated) throw new NotFoundError('Organization');

  await audit(c, 'settings.update', 'organization', tenant.organizationId, {
    keys: Object.keys(parsed.data),
  });

  return c.json({ settings: updated.settings });
});

settings.get('/integrations', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const env = getEnv();

  const aiCount = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(eq(aiProviders.organizationId, tenant.organizationId));

  const integrations = [
    {
      id: 'ai-provider',
      name: 'AI providers',
      description: 'Tenant-scoped LLM keys for chat, embeddings, and drafting.',
      configured: aiCount.length > 0,
      detail: aiCount.length > 0 ? `${aiCount.length} connected` : 'No keys connected',
      href: '/settings/ai-providers',
    },
    {
      id: 'presenton',
      name: 'Presenton',
      description: 'Slide deck and presentation export.',
      configured: Boolean(env.PRESENTON_API_URL && env.PRESENTON_API_KEY),
      detail:
        env.PRESENTON_API_URL && env.PRESENTON_API_KEY
          ? 'Configured'
          : 'Set PRESENTON_API_URL and PRESENTON_API_KEY',
      href: null,
    },
    {
      id: 'scraplink',
      name: 'Scraplink',
      description: 'Website monitoring and scrape jobs.',
      configured: Boolean(env.SCRAPLINK_API_URL && env.SCRAPLINK_API_KEY),
      detail:
        env.SCRAPLINK_API_URL && env.SCRAPLINK_API_KEY
          ? 'Configured'
          : 'Set SCRAPLINK_API_URL and SCRAPLINK_API_KEY',
      href: null,
    },
    {
      id: 'diffy',
      name: 'Diffy',
      description: 'Analytics comparison jobs.',
      configured: Boolean(env.DIFFY_API_URL && env.DIFFY_API_KEY),
      detail:
        env.DIFFY_API_URL && env.DIFFY_API_KEY
          ? 'Configured'
          : 'Set DIFFY_API_URL and DIFFY_API_KEY',
      href: null,
    },
    {
      id: 'storage',
      name: 'Object storage',
      description: 'File uploads for Knowledge Hub (MinIO / S3).',
      configured: Boolean(env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY),
      detail: 'STORAGE_* credentials',
      href: null,
    },
  ];

  return c.json({ integrations });
});

export default settings;
