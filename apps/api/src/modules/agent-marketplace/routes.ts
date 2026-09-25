import { Hono } from 'hono';
import { z } from 'zod';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import {
  marketplaceAgents,
  marketplaceInstallations,
  marketplaceReviews,
} from '../../db/schema.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { audit } from '../audit/service.js';
import { users } from '../../db/schema.js';

const agentMarketplace = new Hono();

const agentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.string().min(1).max(50),
  capabilities: z.array(z.string()).default([]),
  configSchema: z.record(z.unknown()).default({}),
  pricing: z.enum(['free', 'paid', 'subscription']).default('free'),
  priceCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  version: z.string().max(50).default('1.0.0'),
  iconUrl: z.string().url().optional(),
  readmeUrl: z.string().url().optional(),
});

const installSchema = z.object({
  config: z.record(z.unknown()).default({}),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

agentMarketplace.get('/agents', async (c) => {
  const tenant = getTenant(c);
  const category = c.req.query('category');
  const capability = c.req.query('capability');
  const pricing = c.req.query('pricing');
  const q = c.req.query('q');

  const conditions = [
    eq(marketplaceAgents.organizationId, tenant.organizationId),
    eq(marketplaceAgents.status, 'published'),
  ];

  if (category) conditions.push(eq(marketplaceAgents.category, category));
  if (capability)
    conditions.push(sql`${marketplaceAgents.capabilities} @> ${JSON.stringify([capability])}`);
  if (pricing) conditions.push(eq(marketplaceAgents.pricing, pricing));
  if (q) conditions.push(sql`${marketplaceAgents.name} ILIKE ${'%' + q + '%'}`);

  const agents = await getDb()
    .select()
    .from(marketplaceAgents)
    .where(and(...conditions))
    .orderBy(desc(marketplaceAgents.createdAt));

  // Get average ratings
  const agentIds = agents.map((a) => a.id);
  let ratings: Record<string, { avg: number; count: number }> = {};
  if (agentIds.length) {
    const ratingData = await getDb()
      .select({
        agentId: marketplaceReviews.agentId,
        avgRating: sql<number>`round(avg(${marketplaceReviews.rating})::numeric, 1)`,
        count: sql<number>`count(*)::int`,
      })
      .from(marketplaceReviews)
      .where(inArray(marketplaceReviews.agentId, agentIds))
      .groupBy(marketplaceReviews.agentId);
    ratings = Object.fromEntries(
      ratingData.map((r) => [r.agentId, { avg: r.avgRating, count: r.count }]),
    );
  }

  return c.json({
    agents: agents.map((a) => ({
      ...a,
      rating: ratings[a.id]?.avg || 0,
      reviewCount: ratings[a.id]?.count || 0,
    })),
  });
});

agentMarketplace.get('/agents/:id', async (c) => {
  const tenant = getTenant(c);
  const id = c.req.param('id');
  const [agent] = await getDb()
    .select()
    .from(marketplaceAgents)
    .where(
      and(
        eq(marketplaceAgents.id, id),
        eq(marketplaceAgents.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  // Get reviews
  const reviews = await getDb()
    .select({
      review: marketplaceReviews,
      user: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(marketplaceReviews)
    .leftJoin(users, eq(marketplaceReviews.userId, users.id))
    .where(
      and(
        eq(marketplaceReviews.agentId, id),
        eq(marketplaceReviews.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(desc(marketplaceReviews.createdAt));

  // Get avg rating
  const [ratingData] = await getDb()
    .select({
      avgRating: sql<number>`round(avg(${marketplaceReviews.rating})::numeric, 1)`,
      count: sql<number>`count(*)::int`,
    })
    .from(marketplaceReviews)
    .where(
      and(
        eq(marketplaceReviews.agentId, id),
        eq(marketplaceReviews.organizationId, tenant.organizationId),
      ),
    );

  return c.json({
    agent,
    rating: ratingData?.avgRating || 0,
    reviewCount: ratingData?.count || 0,
    reviews,
  });
});

agentMarketplace.post('/agents', requirePermission('agent-marketplace.manage'), async (c) => {
  const tenant = getTenant(c);
  const body = await c.req.json();
  const parsed = agentSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [agent] = await getDb()
    .insert(marketplaceAgents)
    .values({ ...parsed.data, organizationId: tenant.organizationId, publisherId: tenant.userId })
    .returning();

  await audit(c, 'agent-marketplace.agent.create', 'marketplace_agent', agent.id, {
    name: agent.name,
  });
  return c.json({ agent }, 201);
});

agentMarketplace.patch('/agents/:id', requirePermission('agent-marketplace.manage'), async (c) => {
  const tenant = getTenant(c);
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = agentSchema.partial().safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [agent] = await getDb()
    .select()
    .from(marketplaceAgents)
    .where(
      and(
        eq(marketplaceAgents.id, id),
        eq(marketplaceAgents.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const [updated] = await getDb()
    .update(marketplaceAgents)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(marketplaceAgents.id, id))
    .returning();

  await audit(c, 'agent-marketplace.agent.update', 'marketplace_agent', id, parsed.data);
  return c.json({ agent: updated });
});

agentMarketplace.delete('/agents/:id', requirePermission('agent-marketplace.manage'), async (c) => {
  const tenant = getTenant(c);
  const id = c.req.param('id');
  const [agent] = await getDb()
    .select()
    .from(marketplaceAgents)
    .where(
      and(
        eq(marketplaceAgents.id, id),
        eq(marketplaceAgents.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  await getDb().delete(marketplaceAgents).where(eq(marketplaceAgents.id, id));
  await audit(c, 'agent-marketplace.agent.delete', 'marketplace_agent', id, {});
  return c.json({ ok: true });
});

// Installations
agentMarketplace.get('/installations', async (c) => {
  const tenant = getTenant(c);
  const installations = await getDb()
    .select({
      installation: marketplaceInstallations,
      agent: marketplaceAgents,
    })
    .from(marketplaceInstallations)
    .leftJoin(marketplaceAgents, eq(marketplaceInstallations.agentId, marketplaceAgents.id))
    .where(eq(marketplaceInstallations.organizationId, tenant.organizationId))
    .orderBy(desc(marketplaceInstallations.createdAt));
  return c.json({ installations });
});

agentMarketplace.post(
  '/agents/:id/install',
  requirePermission('agent-marketplace.install'),
  async (c) => {
    const tenant = getTenant(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = installSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

    const [agent] = await getDb()
      .select()
      .from(marketplaceAgents)
      .where(
        and(
          eq(marketplaceAgents.id, id),
          eq(marketplaceAgents.organizationId, tenant.organizationId),
        ),
      )
      .limit(1);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const existing = await getDb()
      .select()
      .from(marketplaceInstallations)
      .where(
        and(
          eq(marketplaceInstallations.organizationId, tenant.organizationId),
          eq(marketplaceInstallations.agentId, id),
        ),
      )
      .limit(1);
    if (existing.length) return c.json({ error: 'Agent already installed' }, 409);

    const [installation] = await getDb()
      .insert(marketplaceInstallations)
      .values({
        organizationId: tenant.organizationId,
        agentId: id,
        config: parsed.data.config,
        installedBy: tenant.userId,
        status: 'installed',
      })
      .returning();

    await audit(
      c,
      'agent-marketplace.installation.create',
      'marketplace_installation',
      installation.id,
      { agentId: id },
    );
    return c.json({ installation, agent }, 201);
  },
);

agentMarketplace.delete(
  '/installations/:id',
  requirePermission('agent-marketplace.install'),
  async (c) => {
    const tenant = getTenant(c);
    const id = c.req.param('id');
    const [installation] = await getDb()
      .select()
      .from(marketplaceInstallations)
      .where(
        and(
          eq(marketplaceInstallations.id, id),
          eq(marketplaceInstallations.organizationId, tenant.organizationId),
        ),
      )
      .limit(1);
    if (!installation) return c.json({ error: 'Installation not found' }, 404);

    await getDb().delete(marketplaceInstallations).where(eq(marketplaceInstallations.id, id));
    await audit(c, 'agent-marketplace.installation.delete', 'marketplace_installation', id, {});
    return c.json({ ok: true });
  },
);

// Reviews
agentMarketplace.get('/agents/:id/reviews', async (c) => {
  const tenant = getTenant(c);
  const id = c.req.param('id');
  const reviews = await getDb()
    .select({
      review: marketplaceReviews,
      user: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(marketplaceReviews)
    .leftJoin(users, eq(marketplaceReviews.userId, users.id))
    .where(
      and(
        eq(marketplaceReviews.agentId, id),
        eq(marketplaceReviews.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(desc(marketplaceReviews.createdAt));
  return c.json({ reviews });
});

agentMarketplace.post(
  '/agents/:id/reviews',
  requirePermission('agent-marketplace.review'),
  async (c) => {
    const tenant = getTenant(c);
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

    // Check if agent exists and is installed by this org
    const [installation] = await getDb()
      .select()
      .from(marketplaceInstallations)
      .where(
        and(
          eq(marketplaceInstallations.organizationId, tenant.organizationId),
          eq(marketplaceInstallations.agentId, id),
        ),
      )
      .limit(1);
    if (!installation) return c.json({ error: 'Must install agent before reviewing' }, 403);

    const [review] = await getDb()
      .insert(marketplaceReviews)
      .values({
        organizationId: tenant.organizationId,
        agentId: id,
        userId: tenant.userId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      })
      .returning();

    await audit(c, 'agent-marketplace.review.create', 'marketplace_review', review.id, {
      agentId: id,
      rating: review.rating,
    });
    return c.json({ review }, 201);
  },
);

export default agentMarketplace;
