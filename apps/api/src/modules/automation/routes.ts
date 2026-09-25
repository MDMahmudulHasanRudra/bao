import { Hono } from 'hono';
import { z } from 'zod';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import { automationWorkflows, automationRuns } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { audit } from '../audit/service.js';

const automation = new Hono();

const triggerSchema = z.object({
  type: z.enum(['lead_created', 'stage_changed', 'activity_due', 'schedule', 'webhook']),
  config: z.record(z.unknown()).default({}),
});

const workflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger: triggerSchema,
  conditions: z.record(z.unknown()).default({}),
  actions: z
    .array(
      z.object({
        type: z.enum([
          'create_task',
          'send_email',
          'update_field',
          'notify',
          'webhook',
          'create_lead',
          'update_lead',
        ]),
        config: z.record(z.unknown()).default({}),
      }),
    )
    .default([]),
  enabled: z.boolean().default(true),
});

const runSchema = z.object({
  triggerData: z.record(z.unknown()).default({}),
});

automation.get('/workflows', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const workflows = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
      ),
    )
    .orderBy(desc(automationWorkflows.createdAt));
  return c.json({ workflows });
});

automation.get('/workflows/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [workflow] = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.id, id),
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const runs = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.workflowId, id),
        eq(automationRuns.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(desc(automationRuns.startedAt))
    .limit(10);

  return c.json({ workflow, recentRuns: runs });
});

automation.post('/workflows', requirePermission('automation.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [workflow] = await db
    .insert(automationWorkflows)
    .values({ ...parsed.data, organizationId: tenant.organizationId, createdBy: tenant.userId })
    .returning();

  await audit(c, 'automation.workflow.create', 'automation_workflow', workflow.id, {
    name: workflow.name,
  });
  return c.json({ workflow }, 201);
});

automation.patch('/workflows/:id', requirePermission('automation.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = workflowSchema.partial().safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [workflow] = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.id, id),
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  const [updated] = await db
    .update(automationWorkflows)
    .set({ ...parsed.data, updatedBy: tenant.userId, updatedAt: new Date() })
    .where(eq(automationWorkflows.id, id))
    .returning();

  await audit(c, 'automation.workflow.update', 'automation_workflow', id, parsed.data);
  return c.json({ workflow: updated });
});

automation.delete('/workflows/:id', requirePermission('automation.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [workflow] = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.id, id),
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404);

  await db
    .update(automationWorkflows)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(automationWorkflows.id, id));

  await audit(c, 'automation.workflow.delete', 'automation_workflow', id, {});
  return c.json({ ok: true });
});

automation.post('/workflows/:id/run', requirePermission('automation.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = runSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [workflow] = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.id, id),
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
        eq(automationWorkflows.enabled, true),
      ),
    )
    .limit(1);
  if (!workflow) return c.json({ error: 'Workflow not found or disabled' }, 404);

  const [run] = await db
    .insert(automationRuns)
    .values({
      organizationId: tenant.organizationId,
      workflowId: id,
      status: 'running',
      triggerData: parsed.data.triggerData,
      startedAt: new Date(),
    })
    .returning();

  await db
    .update(automationWorkflows)
    .set({ lastRunAt: new Date(), runCount: sql`${automationWorkflows.runCount} + 1` })
    .where(eq(automationWorkflows.id, id));

  await audit(c, 'automation.workflow.run', 'automation_workflow', id, { runId: run.id });

  setTimeout(async () => {
    try {
      await db
        .update(automationRuns)
        .set({
          status: 'completed',
          result: { message: 'Workflow executed (mock)', steps: workflow.actions?.length ?? 0 },
          completedAt: new Date(),
        })
        .where(eq(automationRuns.id, run.id));
    } catch (err) {
      await db
        .update(automationRuns)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(automationRuns.id, run.id));
    }
  }, 100);

  return c.json({ run }, 201);
});

automation.get('/workflows/:id/runs', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const runs = await db
    .select()
    .from(automationRuns)
    .where(
      and(
        eq(automationRuns.workflowId, id),
        eq(automationRuns.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(desc(automationRuns.startedAt));
  return c.json({ runs });
});

automation.get('/runs/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [run] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.id, id), eq(automationRuns.organizationId, tenant.organizationId)))
    .limit(1);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json({ run });
});

automation.post('/runs/:id/retry', requirePermission('automation.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [run] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.id, id), eq(automationRuns.organizationId, tenant.organizationId)))
    .limit(1);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  const [workflow] = await db
    .select()
    .from(automationWorkflows)
    .where(
      and(
        eq(automationWorkflows.id, run.workflowId),
        eq(automationWorkflows.organizationId, tenant.organizationId),
        sql`${automationWorkflows.deletedAt} IS NULL`,
        eq(automationWorkflows.enabled, true),
      ),
    )
    .limit(1);
  if (!workflow) return c.json({ error: 'Workflow not found or disabled' }, 404);

  const [newRun] = await db
    .insert(automationRuns)
    .values({
      organizationId: tenant.organizationId,
      workflowId: run.workflowId,
      status: 'running',
      triggerData: run.triggerData,
      startedAt: new Date(),
    })
    .returning();

  await audit(c, 'automation.run.retry', 'automation_run', id, { newRunId: newRun.id });

  setTimeout(async () => {
    try {
      await db
        .update(automationRuns)
        .set({
          status: 'completed',
          result: {
            message: 'Workflow executed (mock - retry)',
            steps: workflow.actions?.length ?? 0,
          },
          completedAt: new Date(),
        })
        .where(eq(automationRuns.id, newRun.id));
    } catch (err) {
      await db
        .update(automationRuns)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          completedAt: new Date(),
        })
        .where(eq(automationRuns.id, newRun.id));
    }
  }, 100);

  return c.json({ run: newRun }, 201);
});

export default automation;
