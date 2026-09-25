import { Hono } from 'hono';
import { z } from 'zod';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import {
  billingPlans,
  billingSubscriptions,
  billingInvoices,
  billingPaymentMethods,
  billingUsageRecords,
} from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { audit } from '../audit/service.js';

const billing = new Hono();

const planSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  interval: z.enum(['month', 'year', 'week', 'day']),
  features: z.array(z.string()).default([]),
  limits: z.record(z.unknown()).default({}),
  stripePriceId: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const subscriptionSchema = z.object({
  planId: z.string().uuid(),
});

const paymentMethodSchema = z.object({
  type: z.string().min(1).max(20),
  provider: z.string().min(1).max(20),
  providerPaymentMethodId: z.string().min(1).max(255),
  last4: z.string().max(4).optional(),
  brand: z.string().max(50).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2024).max(2050).optional(),
  isDefault: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});

billing.get('/plans', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const plans = await db
    .select()
    .from(billingPlans)
    .where(
      and(eq(billingPlans.organizationId, tenant.organizationId), eq(billingPlans.isActive, true)),
    )
    .orderBy(billingPlans.sortOrder, billingPlans.createdAt);
  return c.json({ plans });
});

billing.post('/plans', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [plan] = await db
    .insert(billingPlans)
    .values({ ...parsed.data, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'billing.plan.create', 'billing_plan', plan.id, { name: plan.name });
  return c.json({ plan }, 201);
});

billing.get('/subscription', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const [sub] = await db
    .select({
      subscription: billingSubscriptions,
      plan: billingPlans,
    })
    .from(billingSubscriptions)
    .leftJoin(billingPlans, eq(billingSubscriptions.planId, billingPlans.id))
    .where(
      and(
        eq(billingSubscriptions.organizationId, tenant.organizationId),
        eq(billingSubscriptions.status, 'active'),
      ),
    )
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(1);

  if (!sub) return c.json({ subscription: null });
  return c.json({ subscription: sub.subscription, plan: sub.plan });
});

billing.post('/subscription', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [plan] = await db
    .select()
    .from(billingPlans)
    .where(
      and(
        eq(billingPlans.id, parsed.data.planId),
        eq(billingPlans.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!plan) return c.json({ error: 'Plan not found' }, 404);

  const existing = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.organizationId, tenant.organizationId),
        eq(billingSubscriptions.status, 'active'),
      ),
    )
    .limit(1);
  if (existing.length) return c.json({ error: 'Active subscription already exists' }, 409);

  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
  else if (plan.interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else if (plan.interval === 'week') periodEnd.setDate(periodEnd.getDate() + 7);
  else periodEnd.setDate(periodEnd.getDate() + 1);

  const [subscription] = await db
    .insert(billingSubscriptions)
    .values({
      organizationId: tenant.organizationId,
      planId: plan.id,
      status: 'trial',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEndsAt: periodEnd,
    })
    .returning();

  await audit(c, 'billing.subscription.create', 'billing_subscription', subscription.id, {
    planId: plan.id,
  });
  return c.json({ subscription, plan }, 201);
});

billing.patch('/subscription', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const { planId, cancelAtPeriodEnd } = body;

  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.organizationId, tenant.organizationId),
        eq(billingSubscriptions.status, 'active'),
      ),
    )
    .limit(1);
  if (!sub) return c.json({ error: 'No active subscription' }, 404);

  if (planId) {
    const [plan] = await db
      .select()
      .from(billingPlans)
      .where(
        and(eq(billingPlans.id, planId), eq(billingPlans.organizationId, tenant.organizationId)),
      )
      .limit(1);
    if (!plan) return c.json({ error: 'Plan not found' }, 404);

    const periodEnd = new Date();
    if (plan.interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
    else if (plan.interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else if (plan.interval === 'week') periodEnd.setDate(periodEnd.getDate() + 7);
    else periodEnd.setDate(periodEnd.getDate() + 1);

    await db
      .update(billingSubscriptions)
      .set({ planId: plan.id, currentPeriodEnd: periodEnd, updatedAt: new Date() })
      .where(eq(billingSubscriptions.id, sub.id));
  }

  if (cancelAtPeriodEnd) {
    await db
      .update(billingSubscriptions)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(eq(billingSubscriptions.id, sub.id));
  }

  await audit(c, 'billing.subscription.update', 'billing_subscription', sub.id, {
    planId,
    cancelAtPeriodEnd,
  });
  return c.json({ ok: true });
});

billing.delete('/subscription', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.organizationId, tenant.organizationId),
        eq(billingSubscriptions.status, 'active'),
      ),
    )
    .limit(1);
  if (!sub) return c.json({ error: 'No active subscription' }, 404);

  await db
    .update(billingSubscriptions)
    .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(billingSubscriptions.id, sub.id));

  await audit(c, 'billing.subscription.cancel', 'billing_subscription', sub.id, {});
  return c.json({ ok: true });
});

billing.get('/invoices', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const invoices = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.organizationId, tenant.organizationId))
    .orderBy(desc(billingInvoices.createdAt));
  return c.json({ invoices });
});

billing.get('/invoices/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [invoice] = await db
    .select()
    .from(billingInvoices)
    .where(
      and(eq(billingInvoices.id, id), eq(billingInvoices.organizationId, tenant.organizationId)),
    )
    .limit(1);
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  return c.json({ invoice });
});

billing.get('/payment-methods', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const methods = await db
    .select()
    .from(billingPaymentMethods)
    .where(eq(billingPaymentMethods.organizationId, tenant.organizationId))
    .orderBy(desc(billingPaymentMethods.isDefault), desc(billingPaymentMethods.createdAt));
  return c.json({ paymentMethods: methods });
});

billing.post('/payment-methods', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = paymentMethodSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  if (parsed.data.isDefault) {
    await db
      .update(billingPaymentMethods)
      .set({ isDefault: false })
      .where(eq(billingPaymentMethods.organizationId, tenant.organizationId));
  }

  const [method] = await db
    .insert(billingPaymentMethods)
    .values({ ...parsed.data, organizationId: tenant.organizationId, userId: tenant.userId })
    .returning();

  await audit(c, 'billing.payment_method.create', 'billing_payment_method', method.id, {
    provider: method.provider,
  });
  return c.json({ paymentMethod: method }, 201);
});

billing.delete('/payment-methods/:id', requirePermission('billing.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [method] = await db
    .select()
    .from(billingPaymentMethods)
    .where(
      and(
        eq(billingPaymentMethods.id, id),
        eq(billingPaymentMethods.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!method) return c.json({ error: 'Payment method not found' }, 404);

  await db.delete(billingPaymentMethods).where(eq(billingPaymentMethods.id, id));
  await audit(c, 'billing.payment_method.delete', 'billing_payment_method', id, {});
  return c.json({ ok: true });
});

billing.get('/usage', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const from = c.req.query('from');
  const to = c.req.query('to');
  const metric = c.req.query('metric');

  const conditions = [eq(billingUsageRecords.organizationId, tenant.organizationId)];
  if (from) conditions.push(sql`${billingUsageRecords.periodStart} >= ${from}`);
  if (to) conditions.push(sql`${billingUsageRecords.periodEnd} <= ${to}`);
  if (metric) conditions.push(eq(billingUsageRecords.metric, metric));

  const usage = await db
    .select()
    .from(billingUsageRecords)
    .where(and(...conditions))
    .orderBy(desc(billingUsageRecords.periodStart));
  return c.json({ usage });
});

billing.post('/webhooks/stripe', async (c) => {
  return c.json({ received: true });
});

export default billing;
