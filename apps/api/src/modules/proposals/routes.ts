import { Hono, type Context } from 'hono';
import { getDb } from '../../db/index.js';
import { proposals, proposalTemplates, proposalVersions } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';
import { notify } from '../notifications/service.js';

const proposalsRouter = new Hono();

async function loadProposal(c: Context) {
  const tenant = getTenant(c);
  const db = getDb();
  const proposalId = c.req.param('id') as string;
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, tenant.organizationId)))
    .limit(1);
  if (!proposal) throw new NotFoundError('Proposal', proposalId);
  return { tenant, db, proposal };
}

async function snapshotVersion(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  version: number,
  createdBy: string,
) {
  await db
    .insert(proposalVersions)
    .values({
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      version,
      title: proposal.title,
      content: proposal.content,
      createdBy,
    })
    .onConflictDoNothing();
}

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

  if (proposal.content) await snapshotVersion(db, proposal, proposal.version || 1, tenant.userId);

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
  const { tenant, db, proposal } = await loadProposal(c);
  const body = await c.req.json<{ title?: string; content?: string; status?: string }>();

  // Create new version when content changes
  const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
  const contentChanged = body.content !== undefined && body.content !== proposal.content;
  if (contentChanged) {
    updateData.version = (proposal.version || 1) + 1;
  }
  if (body.title !== undefined) updateData.title = body.title;

  const [updated] = await db
    .update(proposals)
    .set(updateData)
    .where(eq(proposals.id, proposal.id))
    .returning();

  if (contentChanged || body.title !== undefined) {
    await snapshotVersion(db, updated, updated.version || 1, tenant.userId);
  }

  await audit(c, 'proposal.update', 'proposal', proposal.id);

  return c.json({ proposal: updated });
});

proposalsRouter.get('/:id/versions', async (c) => {
  const { db, proposal } = await loadProposal(c);

  const versions = await db
    .select({
      id: proposalVersions.id,
      version: proposalVersions.version,
      title: proposalVersions.title,
      content: proposalVersions.content,
      createdAt: proposalVersions.createdAt,
      createdBy: proposalVersions.createdBy,
    })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, proposal.id))
    .orderBy(desc(proposalVersions.version));

  return c.json({ versions });
});

proposalsRouter.post('/:id/versions/:version/restore', async (c) => {
  const { tenant, db, proposal } = await loadProposal(c);
  const versionNum = Number(c.req.param('version'));

  const [snapshot] = await db
    .select()
    .from(proposalVersions)
    .where(
      and(eq(proposalVersions.proposalId, proposal.id), eq(proposalVersions.version, versionNum)),
    )
    .limit(1);
  if (!snapshot) throw new NotFoundError('Proposal version', String(versionNum));

  const [{ maxVersion }] = await db
    .select({ maxVersion: sql<number>`coalesce(max(${proposalVersions.version}), 0)::int` })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, proposal.id));

  const newVersion = Math.max(maxVersion, proposal.version || 1) + 1;
  const [restored] = await db
    .update(proposals)
    .set({
      title: snapshot.title,
      content: snapshot.content,
      version: newVersion,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id))
    .returning();

  await snapshotVersion(db, restored, newVersion, tenant.userId);
  await audit(c, 'proposal.version.restore', 'proposal', proposal.id);

  return c.json({ proposal: restored, restoredFrom: versionNum });
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

  await notify(c, updated.createdBy, 'proposal.approve', `Proposal approved: ${updated.title}`, {
    body: 'Your proposal was marked approved.',
    link: '/proposals',
    metadata: { proposalId },
  });

  return c.json({ proposal: updated });
});

export default proposalsRouter;
