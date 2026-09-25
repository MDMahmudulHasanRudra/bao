import { eq } from 'drizzle-orm';
import { organizations } from './schema.js';
import type { getDb } from './index.js';

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'workspace';
}

export async function uniqueSlug(db: ReturnType<typeof getDb>, desired: string): Promise<string> {
  let candidate = slugify(desired);
  for (let i = 0; i < 50; i++) {
    const [taken] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
    candidate = `${slugify(desired)}-${i + 2}`;
  }
  return `${slugify(desired)}-${Date.now().toString(36)}`;
}
