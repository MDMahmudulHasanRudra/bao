import { loadEnv } from '@bao/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as schema from './schema.js';

async function seed() {
  const env = loadEnv();
  const client = postgres(env.DATABASE_URL);
  const db = drizzle(client, { schema });

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'demo@businessaios.com'))
    .limit(1);

  if (existing) {
    console.log('Seed skipped: demo user already exists');
    await client.end();
    return;
  }

  console.log('Seeding database...');

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: 'Demo Company', slug: 'demo-company' })
    .returning();

  console.log(`Created organization: ${org.name} (${org.id})`);

  const passwordHash = await bcrypt.hash('demo1234', 12);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: 'demo@businessaios.com',
      passwordHash,
      name: 'Demo User',
      emailVerifiedAt: new Date(),
    })
    .returning();

  console.log(`Created user: ${user.email} (${user.id})`);

  await db.insert(schema.memberships).values({
    userId: user.id,
    organizationId: org.id,
    role: 'owner',
  });

  console.log('Created owner membership');

  const [org2] = await db
    .insert(schema.organizations)
    .values({ name: 'Other Company', slug: 'other-company' })
    .returning();

  const [user2] = await db
    .insert(schema.users)
    .values({
      email: 'other@businessaios.com',
      passwordHash,
      name: 'Other User',
      emailVerifiedAt: new Date(),
    })
    .returning();

  await db.insert(schema.memberships).values({
    userId: user2.id,
    organizationId: org2.id,
    role: 'owner',
  });

  console.log(`Created second org: ${org2.name} (${org2.id})`);
  console.log('Seed complete!');

  await client.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
