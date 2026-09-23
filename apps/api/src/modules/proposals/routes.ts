import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { proposals, proposalTemplates } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const proposalsRouter = new Hono();

// ============================================================
// Templates
// ============================================================

proposalsRouter.get('/templates', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const templates = await db
    .select()
    .from(proposalTemplates)
    .where(eq(proposalTemplates.organizationId, tenant.organizationId))
    .orderBy(desc(proposalTemplates.createdAt));

  return c.json({ templates });
});

proposalsRouter.post('/templates', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{ name: string; content: string }>();

  const [template] = await db
    .insert(proposalTemplates)
    .values({ ...body, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'proposal.template.create', 'proposal_template', template.id);

  return c.json({ template }, 201);
});

// ============================================================
// Proposals
// ============================================================

proposalsRouter.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(proposals)
    .where(eq(proposals.organizationId, tenant.organizationId))
    .orderBy(desc(proposals.createdAt));

  return c.json({ proposals: result });
});

proposalsRouter.post('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    title: string;
    leadId?: string;
    templateId?: string;
    content?: string;
  }>();

  const [proposal] = await db
    .insert(proposals)
    .values({
      ...body,
      organizationId: tenant.organizationId,
      createdBy: tenant.userId,
    })
    .returning();

  await audit(c, 'proposal.create', 'proposal', proposal.id);

  return c.json({ proposal }, 201);
});

proposalsRouter.get('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const proposalId = c.req.param('id');

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, tenant.organizationId)))
    .limit(1);

  if (!proposal) throw new NotFoundError('Proposal', proposalId);

  return c.json({ proposal });
});

proposalsRouter.put('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const proposalId = c.req.param('id');
  const body = await c.req.json<{ title?: string; content?: string; status?: string }>();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, tenant.organizationId)))
    .limit(1);

  if (!proposal) throw new NotFoundError('Proposal', proposalId);

  // Create new version when content changes
  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
  if (body.content && body.content !== proposal.content) {
    updateData.version = (proposal.version || 1) + 1;
  }

  const [updated] = await db
    .update(proposals)
    .set(updateData)
    .where(eq(proposals.id, proposalId))
    .returning();

  await audit(c, 'proposal.update', 'proposal', proposalId);

  return c.json({ proposal: updated });
});

proposalsRouter.post('/:id/approve', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const proposalId = c.req.param('id');

  const [updated] = await db
    .update(proposals)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Proposal', proposalId);

  await audit(c, 'proposal.approve', 'proposal', proposalId);

  return c.json({ proposal: updated });
});

export default proposalsRouter;
