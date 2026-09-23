import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Prefer env when present; generate only needs schema, not a live connection.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
  },
});
