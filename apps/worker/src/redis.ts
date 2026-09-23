import Redis from 'ioredis';
import { loadEnv } from '@bao/config';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  const env = loadEnv();
  _redis = new Redis(env.REDIS_URL, {
    // BullMQ workers require null
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return _redis;
}
