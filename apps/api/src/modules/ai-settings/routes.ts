import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { aiModelDefaults, aiProviders } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors/http.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { encryptSecret, decryptSecret, maskKey } from '../../core/security/secret-box.js';
import { rateLimit } from '../../core/middleware/rate-limit.js';
import { audit } from '../audit/service.js';
import {
  PROVIDER_REGISTRY,
  getProviderDef,
  CAPABILITIES,
  isModelCompatible,
  type Capability,
} from '../../integrations/ai-provider/registry.js';
import { testConnection, discoverModels } from '../../integrations/ai-provider/adapter.js';

const MANAGE = requirePermission('ai.providers.manage');

type ProviderRow = typeof aiProviders.$inferSelect;

function maskProvider(row: ProviderRow) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    keySuffix: row.keySuffix,
    status: row.status,
    lastTestedAt: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    lastTestError: row.lastTestError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // NOTE: encryptedKey intentionally omitted — never returned.
  };
}

function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

const aiSettings = new Hono();

aiSettings.use('*', MANAGE);

aiSettings.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const providers = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.organizationId, tenant.organizationId));
  const defaults = await db
    .select()
    .from(aiModelDefaults)
    .where(eq(aiModelDefaults.organizationId, tenant.organizationId));

  return c.json({
    providers: providers.map(maskProvider),
    defaults: defaults.map((d) => ({
      capability: d.capability,
      provider: d.provider,
      modelId: d.modelId,
      updatedAt: d.updatedAt,
    })),
    catalogue: Object.values(PROVIDER_REGISTRY).map((p) => ({
      id: p.id,
      name: p.name,
      docsUrl: p.docsUrl,
      keyHint: p.keyHint,
      requireBaseUrl: !!p.requireBaseUrl,
      supportsEmbeddings: p.supportsEmbeddings,
    })),
    capabilities: CAPABILITIES,
  });
});

aiSettings.post('/', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{
    provider?: string;
    apiKey?: string;
    label?: string;
    baseUrl?: string;
  }>();

  const def = body.provider ? getProviderDef(body.provider) : undefined;
  if (!def) throw new ValidationError({ provider: 'Unknown or missing provider' });
  if (!body.apiKey || body.apiKey.length < 8) {
    throw new ValidationError({ apiKey: 'API key is required (min 8 characters)' });
  }
  if (def.requireBaseUrl) {
    if (!body.baseUrl || !/^https:\/\//.test(body.baseUrl)) {
      throw new ValidationError({ baseUrl: 'HTTPS base URL is required' });
    }
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(
      and(eq(aiProviders.organizationId, tenant.organizationId), eq(aiProviders.provider, def.id)),
    )
    .limit(1);

  const encryptedKey = encryptSecret(body.apiKey);
  const keySuffix = maskKey(body.apiKey).replace('…', '');

  let row: ProviderRow;
  if (existing) {
    const [updated] = await db
      .update(aiProviders)
      .set({
        encryptedKey,
        keySuffix,
        label: body.label || def.name,
        baseUrl: def.requireBaseUrl ? body.baseUrl : null,
        status: 'active',
        lastTestedAt: null,
        lastTestResult: null,
        lastTestError: null,
        updatedBy: tenant.userId,
        updatedAt: new Date(),
      })
      .where(eq(aiProviders.id, existing.id))
      .returning();
    row = updated!;
    await audit(c, 'ai.provider.create', 'ai_provider', row.id, {
      provider: def.id,
      mode: 'replace',
    });
  } else {
    const [created] = await db
      .insert(aiProviders)
      .values({
        organizationId: tenant.organizationId,
        provider: def.id,
        label: body.label || def.name,
        baseUrl: def.requireBaseUrl ? body.baseUrl : null,
        encryptedKey,
        keySuffix,
        createdBy: tenant.userId,
        updatedBy: tenant.userId,
      })
      .returning();
    row = created!;
    await audit(c, 'ai.provider.create', 'ai_provider', row.id, { provider: def.id });
  }

  return c.json({ provider: maskProvider(row) }, 201);
});

aiSettings.post('/:id/test', rateLimit(60000, 10), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id') ?? '';

  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, tenant.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Provider');

  const apiKey = decryptSecret(row.encryptedKey);
  const result = await testConnection(row.provider, apiKey, row.baseUrl);

  await db
    .update(aiProviders)
    .set({
      lastTestedAt: new Date(),
      lastTestResult: result.ok ? 'success' : 'failed',
      lastTestError: result.ok ? null : result.message,
      updatedBy: tenant.userId,
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, row.id));

  await audit(c, 'ai.provider.test', 'ai_provider', row.id, {
    provider: row.provider,
    result: result.ok ? 'success' : 'failed',
    message: result.message,
  });

  return c.json({ result });
});

aiSettings.post('/:id/rotate', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{ apiKey?: string }>();
  if (!body.apiKey || body.apiKey.length < 8) {
    throw new ValidationError({ apiKey: 'New API key is required (min 8 characters)' });
  }

  const db = getDb();
  const id = c.req.param('id') ?? '';
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, tenant.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Provider');

  const [updated] = await db
    .update(aiProviders)
    .set({
      encryptedKey: encryptSecret(body.apiKey),
      keySuffix: maskKey(body.apiKey).replace('…', ''),
      lastTestedAt: null,
      lastTestResult: null,
      lastTestError: null,
      updatedBy: tenant.userId,
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, row.id))
    .returning();

  await audit(c, 'ai.provider.rotate', 'ai_provider', row.id, { provider: row.provider });
  return c.json({ provider: maskProvider(updated!) });
});

aiSettings.post('/:id/revoke', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id') ?? '';

  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, tenant.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Provider');

  // Fallback clarity: capability defaults pointing at this provider are removed too.
  await db
    .delete(aiModelDefaults)
    .where(
      and(
        eq(aiModelDefaults.organizationId, tenant.organizationId),
        eq(aiModelDefaults.provider, row.provider),
      ),
    );
  await db.delete(aiProviders).where(eq(aiProviders.id, row.id));

  await audit(c, 'ai.provider.revoke', 'ai_provider', row.id, {
    provider: row.provider,
    effect: 'key deleted; capability defaults for provider cleared',
  });

  return c.json({ revoked: true });
});

aiSettings.patch('/:id', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{ status?: string; label?: string }>();
  if (body.status && !['active', 'disabled'].includes(body.status)) {
    throw new ValidationError({ status: 'Must be active or disabled' });
  }

  const db = getDb();
  const id = c.req.param('id') ?? '';
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.id, id), eq(aiProviders.organizationId, tenant.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Provider');

  const [updated] = await db
    .update(aiProviders)
    .set({
      status: body.status ?? row.status,
      label: body.label ?? row.label,
      updatedBy: tenant.userId,
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, row.id))
    .returning();

  if (body.status === 'disabled') {
    await db
      .delete(aiModelDefaults)
      .where(
        and(
          eq(aiModelDefaults.organizationId, tenant.organizationId),
          eq(aiModelDefaults.provider, row.provider),
        ),
      );
  }

  await audit(c, 'ai.provider.update', 'ai_provider', row.id, {
    provider: row.provider,
    status: updated!.status,
  });

  return c.json({ provider: maskProvider(updated!) });
});

aiSettings.get('/models', rateLimit(60000, 20), async (c) => {
  const tenant = getTenant(c);
  const providerId = c.req.query('provider');
  const capability = c.req.query('capability');
  if (!providerId || !getProviderDef(providerId)) {
    throw new ValidationError({ provider: 'Unknown provider' });
  }
  if (capability && !isCapability(capability)) {
    throw new ValidationError({ capability: 'Unknown capability' });
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.organizationId, tenant.organizationId),
        eq(aiProviders.provider, providerId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError('Provider connection');
  if (row.status !== 'active') throw new ForbiddenError('Provider is disabled');

  const apiKey = decryptSecret(row.encryptedKey);
  const discovered = await discoverModels(row.provider, apiKey, row.baseUrl);

  let models = discovered.models;
  if (capability && isCapability(capability)) {
    const def = getProviderDef(row.provider)!;
    models = models.filter((m) => isModelCompatible(m.id, capability, def));
  }

  return c.json({
    models,
    source: discovered.source,
    provider: row.provider,
    capability: capability ?? null,
  });
});

aiSettings.get('/defaults', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const defaults = await db
    .select()
    .from(aiModelDefaults)
    .where(eq(aiModelDefaults.organizationId, tenant.organizationId));
  return c.json({
    defaults: defaults.map((d) => ({
      capability: d.capability,
      provider: d.provider,
      modelId: d.modelId,
      updatedAt: d.updatedAt,
    })),
  });
});

aiSettings.put('/defaults', async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json<{ capability?: string; provider?: string; modelId?: string }>();

  if (!body.capability || !isCapability(body.capability)) {
    throw new ValidationError({ capability: 'Unknown capability' });
  }
  if (!body.provider || !body.modelId) {
    throw new ValidationError({ provider: 'provider and modelId are required' });
  }

  const def = getProviderDef(body.provider);
  if (!def) throw new ValidationError({ provider: 'Unknown provider' });
  if (!isModelCompatible(body.modelId, body.capability, def)) {
    throw new ValidationError({
      modelId: `Model is not compatible with capability "${body.capability}"`,
    });
  }

  const db = getDb();
  const [conn] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.organizationId, tenant.organizationId),
        eq(aiProviders.provider, body.provider),
      ),
    )
    .limit(1);
  if (!conn) throw new NotFoundError('Provider connection');
  if (conn.status !== 'active') throw new ForbiddenError('Provider is disabled');

  const [updated] = await db
    .insert(aiModelDefaults)
    .values({
      organizationId: tenant.organizationId,
      capability: body.capability,
      provider: body.provider,
      modelId: body.modelId,
      updatedBy: tenant.userId,
    })
    .onConflictDoUpdate({
      target: [aiModelDefaults.organizationId, aiModelDefaults.capability],
      set: {
        provider: body.provider,
        modelId: body.modelId,
        updatedBy: tenant.userId,
        updatedAt: new Date(),
      },
    })
    .returning();

  await audit(c, 'ai.model_default.update', 'ai_model_default', updated!.id, {
    capability: body.capability,
    provider: body.provider,
    modelId: body.modelId,
  });

  return c.json({
    default: {
      capability: updated!.capability,
      provider: updated!.provider,
      modelId: updated!.modelId,
      updatedAt: updated!.updatedAt,
    },
  });
});

export default aiSettings;
