import type { Context, Next } from 'hono';
import { getEnv } from '../config/env.js';
import { RateLimitError } from '../errors/http.js';

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(windowMs?: number, maxRequests?: number) {
  const env = getEnv();
  const window = windowMs || env.RATE_LIMIT_WINDOW_MS;
  const max = maxRequests || env.RATE_LIMIT_MAX_REQUESTS;

  return async (c: Context, next: Next) => {
    const key = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'global';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + window });
      await next();
      return;
    }

    entry.count++;
    if (entry.count > max) {
      throw new RateLimitError();
    }

    await next();
  };
}
