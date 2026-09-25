import { Hono } from 'hono';
import { z } from 'zod';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import { workflowDefinitions, workflowExecutions, workflowStepRuns } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { audit } from '../audit/service.js';

const workflowBuilder = new Hono();

const nodeSchema = z.object({
  id: z.string(),
  type: z.enum(['trigger', 'action', 'condition', 'delay', 'webhook']),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.unknown()).default({}),
});

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
});

const definitionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
  isActive: z.boolean().default(false),
});

const executionSchema = z.object({
  inputData: z.record(z.unknown()).default({}),
});

workflowBuilder.get('/definitions', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const definitions = await db
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.organizationId, tenant.organizationId))
    .orderBy(desc(workflowDefinitions.updatedAt));
  return c.json({ definitions });
});

workflowBuilder.get('/definitions/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, id),
        eq(workflowDefinitions.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!definition) return c.json({ error: 'Workflow definition not found' }, 404);
  return c.json({ definition });
});

workflowBuilder.post('/definitions', requirePermission('workflow.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = definitionSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [definition] = await db
    .insert(workflowDefinitions)
    .values({ ...parsed.data, organizationId: tenant.organizationId, createdBy: tenant.userId })
    .returning();

  await audit(c, 'workflow.definition.create', 'workflow_definition', definition.id, {
    name: definition.name,
  });
  return c.json({ definition }, 201);
});

workflowBuilder.patch('/definitions/:id', requirePermission('workflow.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = definitionSchema.partial().safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, id),
        eq(workflowDefinitions.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!definition) return c.json({ error: 'Workflow definition not found' }, 404);

  const [updated] = await db
    .update(workflowDefinitions)
    .set({ ...parsed.data, updatedBy: tenant.userId, updatedAt: new Date() })
    .where(eq(workflowDefinitions.id, id))
    .returning();

  await audit(c, 'workflow.definition.update', 'workflow_definition', id, parsed.data);
  return c.json({ definition: updated });
});

workflowBuilder.delete('/definitions/:id', requirePermission('workflow.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, id),
        eq(workflowDefinitions.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!definition) return c.json({ error: 'Workflow definition not found' }, 404);

  await db.delete(workflowDefinitions).where(eq(workflowDefinitions.id, id));
  await audit(c, 'workflow.definition.delete', 'workflow_definition', id, {});
  return c.json({ ok: true });
});

workflowBuilder.post(
  '/definitions/:id/execute',
  requirePermission('workflow.execute'),
  async (c) => {
    const tenant = getTenant(c);
    const db = getDb();
    const id = c.req.param('id');
    const parsed = executionSchema.safeParse(await c.req.json());
    if (!parsed.success)
      return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

    const [definition] = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.organizationId, tenant.organizationId),
          eq(workflowDefinitions.isActive, true),
        ),
      )
      .limit(1);
    if (!definition) return c.json({ error: 'Workflow definition not found or not active' }, 404);

    const [execution] = await db
      .insert(workflowExecutions)
      .values({
        organizationId: tenant.organizationId,
        definitionId: id,
        status: 'running',
        inputData: parsed.data.inputData,
        startedAt: new Date(),
      })
      .returning();

    await audit(c, 'workflow.definition.execute', 'workflow_definition', id, {
      executionId: execution.id,
    });

    // TODO: Implement actual workflow execution engine (async, background job)
    // For now, mock completion
    setTimeout(async () => {
      try {
        await db
          .update(workflowExecutions)
          .set({
            status: 'completed',
            outputData: { message: 'Workflow executed (mock)' },
            completedAt: new Date(),
          })
          .where(eq(workflowExecutions.id, execution.id));
      } catch (err) {
        await db
          .update(workflowExecutions)
          .set({
            status: 'failed',
            error: err instanceof Error ? err.message : 'Unknown error',
            completedAt: new Date(),
          })
          .where(eq(workflowExecutions.id, execution.id));
      }
    }, 100);

    return c.json({ execution }, 201);
  },
);

workflowBuilder.get('/definitions/:id/executions', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const executions = await db
    .select()
    .from(workflowExecutions)
    .where(
      and(
        eq(workflowExecutions.definitionId, id),
        eq(workflowExecutions.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(desc(workflowExecutions.startedAt));
  return c.json({ executions });
});

workflowBuilder.get('/executions/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [execution] = await db
    .select()
    .from(workflowExecutions)
    .where(
      and(
        eq(workflowExecutions.id, id),
        eq(workflowExecutions.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!execution) return c.json({ error: 'Execution not found' }, 404);

  const stepRuns = await db
    .select()
    .from(workflowStepRuns)
    .where(
      and(
        eq(workflowStepRuns.executionId, id),
        eq(workflowStepRuns.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(workflowStepRuns.startedAt);

  return c.json({ execution, stepRuns });
});

workflowBuilder.post('/executions/:id/retry', requirePermission('workflow.execute'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [execution] = await db
    .select()
    .from(workflowExecutions)
    .where(
      and(
        eq(workflowExecutions.id, id),
        eq(workflowExecutions.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!execution) return c.json({ error: 'Execution not found' }, 404);

  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.id, execution.definitionId),
        eq(workflowDefinitions.organizationId, tenant.organizationId),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .limit(1);
  if (!definition) return c.json({ error: 'Workflow definition not found or not active' }, 404);

  const [newExecution] = await db
    .insert(workflowExecutions)
    .values({
      organizationId: tenant.organizationId,
      definitionId: execution.definitionId,
      status: 'running',
      inputData: execution.inputData,
      startedAt: new Date(),
    })
    .returning();

  await audit(c, 'workflow.execution.retry', 'workflow_execution', id, {
    newExecutionId: newExecution.id,
  });

  setTimeout(async () => {
    try {
      await db
        .update(workflowExecutions)
        .set({
          status: 'completed',
          outputData: { message: 'Workflow executed (mock - retry)' },
          completedAt: new Date(),
        })
        .where(eq(workflowExecutions.id, newExecution.id));
    } catch (err) {
      await db
        .update(workflowExecutions)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(workflowExecutions.id, newExecution.id));
    }
  }, 100);

  return c.json({ execution: newExecution }, 201);
});

export default workflowBuilder;
