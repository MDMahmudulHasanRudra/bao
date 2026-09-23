import Redis from 'ioredis';
import { getEnv } from '../core/config/env.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const env = getEnv();
  _redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
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
