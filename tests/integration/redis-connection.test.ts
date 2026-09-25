import type Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars!!';
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
process.env.STORAGE_ACCESS_KEY = 'test';
process.env.STORAGE_SECRET_KEY = 'test';
process.env.AI_API_KEY = 'test';

import { loadEnv } from '@bao/config';
loadEnv();

import { getRedis } from '../../apps/api/src/redis/index.js';

/**
 * BullMQ's RedisConnection.checkBlockingOptions throws at `new Worker(...)` unless
 * maxRetriesPerRequest is null, because it issues blocking commands and must never give up
 * mid-job. That crash killed the API container on first boot: serve() had already bound
 * port 5000, so the container looked briefly alive, then the process died.
 * https://docs.bullmq.io/guide/connections
 */
describe('api redis connection', () => {
  let client: Redis | undefined;

  afterAll(() => {
    client?.disconnect();
  });

  it('gives BullMQ a connection it will accept', () => {
    client = getRedis();
    client.on('error', () => {});
    expect(client.options.maxRetriesPerRequest).toBeNull();
  });
});
