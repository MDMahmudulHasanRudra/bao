import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { presentations } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const presentationsRouter = new Hono();

presentationsRouter.get('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(presentations)
    .where(eq(presentations.organizationId, tenant.organizationId))
    .orderBy(desc(presentations.createdAt));

  return c.json({ presentations: result });
});

presentationsRouter.post('/', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    title: string;
    proposalId?: string;
    content?: string;
  }>();

  const [presentation] = await db
    .insert(presentations)
    .values({
      ...body,
      organizationId: tenant.organizationId,
      requestedBy: tenant.userId,
      status: 'pending',
    })
    .returning();

  // Queue presentation generation via Presenton adapter
  // In production, this would call the Presenton integration

  await audit(c, 'presentation.create', 'presentation', presentation.id);

  return c.json({ presentation }, 201);
});

presentationsRouter.get('/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const presentationId = c.req.param('id');

  const [presentation] = await db
    .select()
    .from(presentations)
    .where(
      and(
        eq(presentations.id, presentationId),
        eq(presentations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!presentation) throw new NotFoundError('Presentation', presentationId);

  return c.json({ presentation });
});

presentationsRouter.get('/:id/status', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const presentationId = c.req.param('id');

  const [presentation] = await db
    .select({ status: presentations.status, outputUrl: presentations.outputUrl })
    .from(presentations)
    .where(
      and(
        eq(presentations.id, presentationId),
        eq(presentations.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);

  if (!presentation) throw new NotFoundError('Presentation', presentationId);

  return c.json({ status: presentation.status, outputUrl: presentation.outputUrl });
});

export default presentationsRouter;
