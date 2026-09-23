import type { Context } from 'hono';
import { sql } from 'drizzle-orm';

export function healthHandler(c: Context) {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function readinessHandler(c: Context) {
  const checks: Record<string, string> = {};

  try {
    const { getDb } = await import('../../db/index.js');
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'error';
  }

  try {
    const { getRedis } = await import('../../redis/index.js');
    const redis = getRedis();
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  return c.json({ status: allOk ? 'ok' : 'degraded', checks }, allOk ? 200 : 503);
}
