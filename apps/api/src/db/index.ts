import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getEnv } from '../core/config/env.js';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;
  const env = getEnv();
  _client = postgres(env.DATABASE_URL, { ssl: env.DATABASE_SSL });
  _db = drizzle(_client, { schema });
  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}
