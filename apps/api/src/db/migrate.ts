import { loadEnv } from '@bao/config';
import postgres from 'postgres';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(process.cwd(), 'drizzle'),
    join(here, '../../drizzle'),
    join(here, '../drizzle'),
    join(here, 'drizzle'),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(`Migrations directory not found; tried: ${candidates.join(', ')}`);
}

async function migrate() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { onnotice: () => {} });

  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [row] = await sql<{ name: string }[]>`
      SELECT name FROM schema_migrations WHERE name = ${file}
    `;
    if (row) continue;

    // Existing volume may already have tables from host-side drizzle-kit migrate
    const [table] = await sql<{ to_regclass: string | null }[]>`
      SELECT to_regclass('users') AS to_regclass
    `;
    if (table?.to_regclass) {
      await sql`INSERT INTO schema_migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
      console.log(`Migration already present in DB, recorded: ${file}`);
      continue;
    }

    const body = readFileSync(join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`Applied migration: ${file}`);
  }

  await sql.end();
  console.log('Migrations up to date');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
