import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { whiteLabelSettings } from '../../db/schema.js';
import { getTenant, requirePermission } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import {
  buildTenantKey,
  deleteFile,
  getFileUrl,
  uploadFile,
} from '../../integrations/storage/index.js';

const whiteLabel = new Hono();

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const urlOrEmpty = z.union([z.string().url().max(500), z.literal('')]);

const FONT_FAMILIES = ['system', 'inter', 'georgia', 'helvetica', 'roboto', 'mono'] as const;

const colorOrEmpty = z.union([
  z.string().regex(HEX, 'Must be a hex colour like #4f46e5'),
  z.literal(''),
]);

// customDomain is stored bare: no scheme, no path, no port — it is matched against the request Host header
const domainOrEmpty = z
  .union([z.string().max(255), z.literal('')])
  .transform((v) => v.trim().toLowerCase())
  .refine(
    (v) => v === '' || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v),
    {
      message: 'Enter a bare hostname, e.g. app.acme.com (no scheme, no path, no port)',
    },
  );

export const brandingSchema = z
  .object({
    productName: z.union([z.string().min(1).max(120), z.literal('')]).optional(),
    tagline: z.union([z.string().max(200), z.literal('')]).optional(),
    primaryColor: colorOrEmpty.optional(),
    secondaryColor: colorOrEmpty.optional(),
    fontFamily: z.enum(FONT_FAMILIES).optional(),
    customDomain: domainOrEmpty.optional(),
    emailFromName: z.union([z.string().max(120), z.literal('')]).optional(),
    emailReplyTo: z.union([z.string().email().max(255), z.literal('')]).optional(),
    termsUrl: urlOrEmpty.optional(),
    privacyUrl: urlOrEmpty.optional(),
  })
  .strict();

const ASSET_TYPES = ['logo', 'favicon', 'loginBackground'] as const;
type AssetType = (typeof ASSET_TYPES)[number];

const ASSET_CONFIG: Record<
  AssetType,
  { column: 'logoKey' | 'faviconKey' | 'loginBackgroundKey'; maxBytes: number; types: string[] }
> = {
  logo: {
    column: 'logoKey',
    maxBytes: 2 * 1024 * 1024,
    types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  },
  favicon: {
    column: 'faviconKey',
    maxBytes: 512 * 1024,
    types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  },
  loginBackground: {
    column: 'loginBackgroundKey',
    maxBytes: 5 * 1024 * 1024,
    types: ['image/png', 'image/jpeg', 'image/webp'],
  },
};

function isAssetType(v: string): v is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(v);
}

/**
 * Public-by-design projection. The unauthenticated /branding endpoint serves exactly
 * these fields and nothing else — never emailReplyTo, terms/privacy URLs, customDomain,
 * or any internal id. Keep this list an explicit allowlist; never spread the row.
 */
async function publicBranding(orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.organizationId, orgId))
    .limit(1);
  if (!row) return null;

  const [logoUrl, faviconUrl, loginBackgroundUrl] = await Promise.all([
    row.logoKey ? getFileUrl(row.logoKey, 86400) : null,
    row.faviconKey ? getFileUrl(row.faviconKey, 86400) : null,
    row.loginBackgroundKey ? getFileUrl(row.loginBackgroundKey, 86400) : null,
  ]);

  return {
    productName: row.productName,
    tagline: row.tagline,
    logoUrl,
    faviconUrl,
    loginBackgroundUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    fontFamily: row.fontFamily,
  };
}

// --- tenant-scoped settings -------------------------------------------------

whiteLabel.get('/', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const [row] = await db
    .select()
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.organizationId, tenant.organizationId))
    .limit(1);

  const assets = row
    ? {
        logoUrl: row.logoKey ? await getFileUrl(row.logoKey, 3600) : null,
        faviconUrl: row.faviconKey ? await getFileUrl(row.faviconKey, 3600) : null,
        loginBackgroundUrl: row.loginBackgroundKey
          ? await getFileUrl(row.loginBackgroundKey, 3600)
          : null,
      }
    : { logoUrl: null, faviconUrl: null, loginBackgroundUrl: null };

  return c.json({ settings: row ?? null, assets });
});

whiteLabel.put('/', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json().catch(() => null);

  const parsed = brandingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);
  }

  // empty string clears a field; the column stores null for "unset"
  const patch = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === '' ? null : v]),
  ) as Partial<typeof whiteLabelSettings.$inferInsert>;

  const [existing] = await db
    .select({ id: whiteLabelSettings.id })
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.organizationId, tenant.organizationId))
    .limit(1);

  // The unique index is the real guarantee; this check just turns a raw
  // constraint violation into a message the settings UI can show.
  if (patch.customDomain) {
    const [taken] = await db
      .select({ id: whiteLabelSettings.id })
      .from(whiteLabelSettings)
      .where(eq(whiteLabelSettings.customDomain, patch.customDomain))
      .limit(1);
    if (taken && taken.id !== existing?.id) {
      return c.json({ error: 'That custom domain is already in use' }, 409);
    }
  }

  if (existing) {
    const [updated] = await db
      .update(whiteLabelSettings)
      .set({ ...patch, updatedBy: tenant.userId, updatedAt: new Date() })
      .where(eq(whiteLabelSettings.id, existing.id))
      .returning();
    await audit(c, 'white_label.update', 'organization', tenant.organizationId, {
      keys: Object.keys(patch),
    });
    return c.json({ settings: updated });
  }

  const [created] = await db
    .insert(whiteLabelSettings)
    .values({ ...patch, organizationId: tenant.organizationId, updatedBy: tenant.userId })
    .returning();
  await audit(c, 'white_label.create', 'organization', tenant.organizationId, {
    keys: Object.keys(patch),
  });
  return c.json({ settings: created }, 201);
});

whiteLabel.post('/assets/:type', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const type = c.req.param('type');
  if (!isAssetType(type)) {
    return c.json(
      { error: 'ValidationError', details: { type: `Must be one of: ${ASSET_TYPES.join(', ')}` } },
      422,
    );
  }
  const config = ASSET_CONFIG[type];

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file)
    return c.json({ error: 'ValidationError', details: { file: 'File is required' } }, 422);
  if (!config.types.includes(file.type)) {
    return c.json(
      { error: 'ValidationError', details: { file: `Unsupported type: ${file.type}` } },
      422,
    );
  }
  if (file.size > config.maxBytes) {
    return c.json(
      {
        error: 'ValidationError',
        details: { file: `File too large. Max: ${Math.round(config.maxBytes / 1024)}KB` },
      },
      422,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = buildTenantKey(
    tenant.organizationId,
    'white-label',
    `${type}-${Date.now()}-${file.name}`,
  );
  await uploadFile(storageKey, buffer, file.type);

  const [existing] = await db
    .select()
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.organizationId, tenant.organizationId))
    .limit(1);

  const previousKey = existing?.[config.column];
  if (existing) {
    await db
      .update(whiteLabelSettings)
      .set({ [config.column]: storageKey, updatedBy: tenant.userId, updatedAt: new Date() })
      .where(eq(whiteLabelSettings.organizationId, tenant.organizationId));
  } else {
    await db.insert(whiteLabelSettings).values({
      organizationId: tenant.organizationId,
      updatedBy: tenant.userId,
      [config.column]: storageKey,
    });
  }

  // best-effort cleanup of the replaced object; never fail the request over it
  if (previousKey) {
    await deleteFile(previousKey).catch(() => undefined);
  }

  await audit(c, 'white_label.asset.upload', 'organization', tenant.organizationId, { type });
  return c.json({ key: storageKey, url: await getFileUrl(storageKey, 3600) }, 201);
});

whiteLabel.delete('/assets/:type', requirePermission('org.settings.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const type = c.req.param('type');
  if (!isAssetType(type)) {
    return c.json(
      { error: 'ValidationError', details: { type: `Must be one of: ${ASSET_TYPES.join(', ')}` } },
      422,
    );
  }
  const config = ASSET_CONFIG[type];

  const [existing] = await db
    .select()
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.organizationId, tenant.organizationId))
    .limit(1);

  if (!existing) return c.json({ error: 'Asset not set' }, 404);
  const currentKey = existing[config.column];
  if (!currentKey) return c.json({ error: 'Asset not set' }, 404);

  await db
    .update(whiteLabelSettings)
    .set({ [config.column]: null, updatedBy: tenant.userId, updatedAt: new Date() })
    .where(eq(whiteLabelSettings.organizationId, tenant.organizationId));

  await deleteFile(currentKey).catch(() => undefined);
  await audit(c, 'white_label.asset.delete', 'organization', tenant.organizationId, { type });
  return c.json({ ok: true });
});

// --- public ----------------------------------------------------------------

/**
 * Unauthenticated. Resolves the tenant from the request Host header matching a
 * configured customDomain, so an anonymous visitor on a branded domain sees that
 * org's branding on the login page.
 *
 * Mounted OUTSIDE the auth/tenant middleware stack. Only publicBranding()'s
 * allowlisted fields ever leave this handler; an unknown host 404s quietly so it
 * does not confirm which hosts are tenants.
 */
/** Strips the port and normalises case so it can be compared to a stored customDomain. */
export function resolveHost(hostHeader: string | undefined | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0].trim().toLowerCase();
  return host.length > 0 ? host : null;
}

export async function handlePublicBranding(hostHeader: string | undefined | null) {
  const host = resolveHost(hostHeader);
  if (!host) return null;

  const db = getDb();
  const [match] = await db
    .select({ organizationId: whiteLabelSettings.organizationId })
    .from(whiteLabelSettings)
    .where(eq(whiteLabelSettings.customDomain, host))
    .limit(1);
  if (!match) return null;

  return publicBranding(match.organizationId);
}

export const publicBrandingRouter = new Hono();

publicBrandingRouter.get('/branding', async (c) => {
  const branding = await handlePublicBranding(
    c.req.header('host') ?? c.req.header('x-forwarded-host'),
  );
  if (!branding) return c.json({ error: 'Not found' }, 404);
  return c.json({ branding });
});

export default whiteLabel;
