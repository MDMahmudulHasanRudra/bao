import { Hono } from 'hono';
import { getDb } from '../../db/index.js';
import { companies, contacts, leads, activities } from '../../db/schema.js';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../core/errors/http.js';
import { getTenant } from '../../core/tenancy/context.js';
import { audit } from '../audit/service.js';

const sales = new Hono();

// ============================================================
// Companies
// ============================================================

sales.get('/companies', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(companies)
    .where(and(eq(companies.organizationId, tenant.organizationId), isNull(companies.deletedAt)))
    .orderBy(desc(companies.createdAt));

  return c.json({ companies: result });
});

sales.post('/companies', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
  }>();

  const [company] = await db
    .insert(companies)
    .values({ ...body, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'sales.company.create', 'company', company.id);

  return c.json({ company }, 201);
});

sales.get('/companies/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const companyId = c.req.param('id');

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, tenant.organizationId)))
    .limit(1);

  if (!company) throw new NotFoundError('Company', companyId);

  return c.json({ company });
});

sales.put('/companies/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const companyId = c.req.param('id');
  const body = await c.req.json<{ name?: string; domain?: string; industry?: string }>();

  const [updated] = await db
    .update(companies)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Company', companyId);

  await audit(c, 'sales.company.update', 'company', companyId);

  return c.json({ company: updated });
});

sales.delete('/companies/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const companyId = c.req.param('id');

  const [updated] = await db
    .update(companies)
    .set({ deletedAt: new Date() })
    .where(and(eq(companies.id, companyId), eq(companies.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Company', companyId);

  await audit(c, 'sales.company.delete', 'company', companyId);

  return c.json({ success: true });
});

// ============================================================
// Contacts
// ============================================================

sales.get('/contacts', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const result = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, tenant.organizationId), isNull(contacts.deletedAt)))
    .orderBy(desc(contacts.createdAt));

  return c.json({ contacts: result });
});

sales.post('/contacts', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    companyId?: string;
    title?: string;
  }>();

  const [contact] = await db
    .insert(contacts)
    .values({ ...body, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'sales.contact.create', 'contact', contact.id);

  return c.json({ contact }, 201);
});

sales.get('/contacts/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const contactId = c.req.param('id');

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, tenant.organizationId)))
    .limit(1);

  if (!contact) throw new NotFoundError('Contact', contactId);

  return c.json({ contact });
});

sales.put('/contacts/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const contactId = c.req.param('id');
  const body = await c.req.json<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }>();

  const [updated] = await db
    .update(contacts)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Contact', contactId);

  await audit(c, 'sales.contact.update', 'contact', contactId);

  return c.json({ contact: updated });
});

sales.delete('/contacts/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const contactId = c.req.param('id');

  const [updated] = await db
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Contact', contactId);

  await audit(c, 'sales.contact.delete', 'contact', contactId);

  return c.json({ success: true });
});

// ============================================================
// Leads
// ============================================================

sales.get('/leads', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const stage = c.req.query('stage');

  const conditions = [eq(leads.organizationId, tenant.organizationId), isNull(leads.deletedAt)];
  if (stage) conditions.push(eq(leads.stage, stage));

  const result = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));

  return c.json({ leads: result });
});

sales.post('/leads', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    title: string;
    stage?: string;
    value?: number;
    companyId?: string;
    contactId?: string;
    expectedCloseDate?: string;
  }>();

  const [lead] = await db
    .insert(leads)
    .values({
      ...body,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
      organizationId: tenant.organizationId,
      ownerId: tenant.userId,
    })
    .returning();

  await audit(c, 'sales.lead.create', 'lead', lead.id);

  return c.json({ lead }, 201);
});

sales.get('/leads/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const leadId = c.req.param('id');

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, tenant.organizationId)))
    .limit(1);

  if (!lead) throw new NotFoundError('Lead', leadId);

  return c.json({ lead });
});

sales.put('/leads/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const leadId = c.req.param('id');
  const body = await c.req.json<{
    title?: string;
    stage?: string;
    value?: number;
    notes?: string;
  }>();

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, tenant.organizationId)))
    .limit(1);

  if (!lead) throw new NotFoundError('Lead', leadId);

  // Validate stage transitions
  if (body.stage) {
    const validTransitions: Record<string, string[]> = {
      new: ['qualified'],
      qualified: ['proposal', 'closed_lost'],
      proposal: ['negotiation', 'closed_lost'],
      negotiation: ['closed_won', 'closed_lost'],
      closed_won: [],
      closed_lost: ['new'],
    };

    if (!validTransitions[lead.stage]?.includes(body.stage)) {
      throw new ForbiddenError(`Invalid stage transition: ${lead.stage} -> ${body.stage}`);
    }
  }

  const [updated] = await db
    .update(leads)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, tenant.organizationId)))
    .returning();

  await audit(c, 'sales.lead.update', 'lead', leadId, { stage: body.stage });

  return c.json({ lead: updated });
});

sales.delete('/leads/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const leadId = c.req.param('id');

  const [updated] = await db
    .update(leads)
    .set({ deletedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, tenant.organizationId)))
    .returning();

  if (!updated) throw new NotFoundError('Lead', leadId);

  await audit(c, 'sales.lead.delete', 'lead', leadId);

  return c.json({ success: true });
});

// ============================================================
// Activities
// ============================================================

sales.get('/activities', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const leadId = c.req.query('leadId');

  const conditions = [eq(activities.organizationId, tenant.organizationId)];
  if (leadId) conditions.push(eq(activities.leadId, leadId));

  const result = await db
    .select()
    .from(activities)
    .where(and(...conditions))
    .orderBy(desc(activities.createdAt));

  return c.json({ activities: result });
});

sales.post('/activities', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json<{
    type: string;
    subject: string;
    body?: string;
    leadId?: string;
    contactId?: string;
    companyId?: string;
    dueAt?: string;
  }>();

  const [activity] = await db
    .insert(activities)
    .values({
      ...body,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    })
    .returning();

  await audit(c, 'sales.activity.create', 'activity', activity.id);

  return c.json({ activity }, 201);
});

sales.patch('/activities/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json<{ completed?: boolean; dueAt?: string | null }>();

  const [existing] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, id), eq(activities.organizationId, tenant.organizationId)));
  if (!existing) throw new NotFoundError('Activity', id);

  const patch: Partial<typeof activities.$inferInsert> = {};
  if (body.completed === true) patch.completedAt = new Date();
  if (body.completed === false) patch.completedAt = null;
  if (body.dueAt !== undefined) {
    patch.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  }

  const [activity] = await db
    .update(activities)
    .set(patch)
    .where(and(eq(activities.id, id), eq(activities.organizationId, tenant.organizationId)))
    .returning();

  await audit(c, 'sales.activity.update', 'activity', id);

  return c.json({ activity });
});

// ============================================================
// Pipeline Summary
// ============================================================

sales.get('/pipeline', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  const pipeline = await db
    .select({
      stage: leads.stage,
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${leads.value}), 0)::int`,
    })
    .from(leads)
    .where(and(eq(leads.organizationId, tenant.organizationId), isNull(leads.deletedAt)))
    .groupBy(leads.stage);

  return c.json({ pipeline });
});

export default sales;
