import type { Context } from 'hono';
import { getDb } from '../../db/index.js';
import { auditEvents } from '../../db/schema.js';
import { getTenant } from '../../core/tenancy/context.js';

const SECRET_KEY = /key|secret|password|token|credential|authorization|bearer/i;
const SECRET_VALUE = /sk-[a-zA-Z0-9_-]{8,}|Bearer\s+\S+|api[_-]?key\s*[=:]/i;

export function redactDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
    if (SECRET_KEY.test(k)) {
      out[k] = '••••';
      continue;
    }
    if (typeof v === 'string' && SECRET_VALUE.test(v)) {
      out[k] = '••••';
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactDetails(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function audit(
  c: Context,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>,
) {
  try {
    const tenant = getTenant(c);
    const db = getDb();
    await db.insert(auditEvents).values({
      organizationId: tenant.organizationId,
      actorId: tenant.userId,
      action,
      resourceType,
      resourceId: resourceId || undefined,
      details: redactDetails(details || {}),
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });
  } catch {
    // Audit should never fail the request
  }
}
