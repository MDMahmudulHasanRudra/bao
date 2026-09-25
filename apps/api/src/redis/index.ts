import Redis from 'ioredis';
import { getEnv } from '../core/config/env.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const env = getEnv();
  _redis = new Redis(env.REDIS_URL, {
    // BullMQ throws on construction unless this is null — it uses blocking commands and
    // requires unbounded retries so a job is never silently dropped mid-flight. Matches
    // apps/worker/src/redis.ts. Do not "tune" this back to a finite number.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return _redis;
}

export async function closeRedis() {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
