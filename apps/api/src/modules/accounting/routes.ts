import { Hono } from 'hono';
import { z } from 'zod';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import {
  accountingAccounts,
  accountingJournalEntries,
  accountingJournalLines,
  accountingTaxRates,
  accountingInvoices,
  accountingPayments,
} from '../../db/schema.js';
import { eq, and, desc, gte, lte, sql, sum } from 'drizzle-orm';
import { audit } from '../audit/service.js';

const accounting = new Hono();

const accountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parentId: z.string().uuid().optional(),
  currency: z.string().length(3).default('USD'),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});

const journalEntrySchema = z.object({
  entryNumber: z.string().min(1).max(50),
  date: z.string(),
  description: z.string().optional(),
  reference: z.string().optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: z.number().int().min(0).default(0),
        credit: z.number().int().min(0).default(0),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
      }),
    )
    .min(2),
});

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  date: z.string(),
  dueDate: z.string().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'void']).default('draft'),
  subtotal: z.number().int().min(0).default(0),
  taxAmount: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  paymentNumber: z.string().min(1).max(50),
  date: z.string(),
  amount: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  invoiceId: z.string().uuid().optional(),
});

const taxRateSchema = z.object({
  name: z.string().min(1).max(100),
  rate: z.number().int().min(0),
  appliesTo: z.enum(['sales', 'purchases', 'both']).default('both'),
  isActive: z.boolean().default(true),
});

function parseDate(d: string) {
  return new Date(d);
}

function parseDateString(d: string) {
  return new Date(d).toISOString().split('T')[0];
}

function toDateString(d: Date) {
  return d.toISOString().split('T')[0];
}

// Accounts
accounting.get('/accounts', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const accounts = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.organizationId, tenant.organizationId),
        eq(accountingAccounts.isActive, true),
      ),
    )
    .orderBy(accountingAccounts.code);
  return c.json({ accounts });
});

accounting.post('/accounts', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const existing = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.organizationId, tenant.organizationId),
        eq(accountingAccounts.code, parsed.data.code),
      ),
    )
    .limit(1);
  if (existing.length) return c.json({ error: 'Account code already exists' }, 409);

  const [account] = await db
    .insert(accountingAccounts)
    .values({ ...parsed.data, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'accounting.account.create', 'accounting_account', account.id, {
    code: account.code,
    name: account.name,
  });
  return c.json({ account }, 201);
});

accounting.patch('/accounts/:id', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = accountSchema.partial().safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [account] = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.id, id),
        eq(accountingAccounts.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!account) return c.json({ error: 'Account not found' }, 404);

  const [updated] = await db
    .update(accountingAccounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(accountingAccounts.id, id))
    .returning();

  await audit(c, 'accounting.account.update', 'accounting_account', id, parsed.data);
  return c.json({ account: updated });
});

accounting.delete('/accounts/:id', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [account] = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.id, id),
        eq(accountingAccounts.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!account) return c.json({ error: 'Account not found' }, 404);

  await db
    .update(accountingAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(accountingAccounts.id, id));
  await audit(c, 'accounting.account.delete', 'accounting_account', id, {});
  return c.json({ ok: true });
});

// Journal Entries
accounting.get('/journal-entries', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const from = c.req.query('from');
  const to = c.req.query('to');
  const status = c.req.query('status');

  const conditions = [eq(accountingJournalEntries.organizationId, tenant.organizationId)];
  if (from) conditions.push(gte(accountingJournalEntries.date, from));
  if (to) conditions.push(lte(accountingJournalEntries.date, to));
  if (status) conditions.push(eq(accountingJournalEntries.status, status));

  const entries = await db
    .select()
    .from(accountingJournalEntries)
    .where(and(...conditions))
    .orderBy(desc(accountingJournalEntries.date), desc(accountingJournalEntries.createdAt))
    .limit(100);
  return c.json({ entries });
});

accounting.get('/journal-entries/:id', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [entry] = await db
    .select()
    .from(accountingJournalEntries)
    .where(
      and(
        eq(accountingJournalEntries.id, id),
        eq(accountingJournalEntries.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);

  const lines = await db
    .select({
      line: accountingJournalLines,
      account: accountingAccounts,
    })
    .from(accountingJournalLines)
    .leftJoin(accountingAccounts, eq(accountingJournalLines.accountId, accountingAccounts.id))
    .where(
      and(
        eq(accountingJournalLines.entryId, id),
        eq(accountingJournalLines.organizationId, tenant.organizationId),
      ),
    )
    .orderBy(accountingJournalLines.sortOrder);

  return c.json({ entry, lines });
});

accounting.post('/journal-entries', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = journalEntrySchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  // Validate balanced entry
  const totalDebit = parsed.data.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = parsed.data.lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit)
    return c.json({ error: 'Entry must be balanced (debits = credits)' }, 422);

  const [entry] = await db
    .insert(accountingJournalEntries)
    .values({
      organizationId: tenant.organizationId,
      entryNumber: parsed.data.entryNumber,
      date: parseDateString(parsed.data.date),
      description: parsed.data.description,
      reference: parsed.data.reference,
      status: 'draft',
      createdBy: tenant.userId,
    })
    .returning();

  const lines = await db
    .insert(accountingJournalLines)
    .values(
      parsed.data.lines.map((l) => ({
        organizationId: tenant.organizationId,
        entryId: entry.id,
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
        sortOrder: l.sortOrder,
      })),
    )
    .returning();

  await audit(c, 'accounting.journal_entry.create', 'accounting_journal_entry', entry.id, {
    entryNumber: entry.entryNumber,
  });
  return c.json({ entry, lines }, 201);
});

accounting.post('/journal-entries/:id/post', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [entry] = await db
    .select()
    .from(accountingJournalEntries)
    .where(
      and(
        eq(accountingJournalEntries.id, id),
        eq(accountingJournalEntries.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);
  if (entry.status !== 'draft') return c.json({ error: 'Only draft entries can be posted' }, 400);

  const lines = await db
    .select()
    .from(accountingJournalLines)
    .where(
      and(
        eq(accountingJournalLines.entryId, id),
        eq(accountingJournalLines.organizationId, tenant.organizationId),
      ),
    );

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) return c.json({ error: 'Entry not balanced' }, 400);

  await db
    .update(accountingJournalEntries)
    .set({ status: 'posted', postedBy: tenant.userId, postedAt: new Date(), updatedAt: new Date() })
    .where(eq(accountingJournalEntries.id, id));

  // Update account balances
  for (const line of lines) {
    const delta = line.debit - line.credit;
    await db
      .update(accountingAccounts)
      .set({ balance: sql`${accountingAccounts.balance} + ${delta}`, updatedAt: new Date() })
      .where(eq(accountingAccounts.id, line.accountId));
  }

  await audit(c, 'accounting.journal_entry.post', 'accounting_journal_entry', id, {});
  return c.json({ ok: true });
});

accounting.delete('/journal-entries/:id', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [entry] = await db
    .select()
    .from(accountingJournalEntries)
    .where(
      and(
        eq(accountingJournalEntries.id, id),
        eq(accountingJournalEntries.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);
  if (entry.status === 'posted')
    return c.json({ error: 'Posted entries cannot be deleted, void instead' }, 400);

  await db.delete(accountingJournalLines).where(eq(accountingJournalLines.entryId, id));
  await db.delete(accountingJournalEntries).where(eq(accountingJournalEntries.id, id));
  await audit(c, 'accounting.journal_entry.delete', 'accounting_journal_entry', id, {});
  return c.json({ ok: true });
});

// Invoices
accounting.get('/invoices', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');

  const conditions = [eq(accountingInvoices.organizationId, tenant.organizationId)];
  if (status) conditions.push(eq(accountingInvoices.status, status));
  if (from) conditions.push(gte(accountingInvoices.date, from));
  if (to) conditions.push(lte(accountingInvoices.date, to));

  const invoices = await db
    .select()
    .from(accountingInvoices)
    .where(and(...conditions))
    .orderBy(desc(accountingInvoices.date));
  return c.json({ invoices });
});

accounting.post('/invoices', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const existing = await db
    .select()
    .from(accountingInvoices)
    .where(
      and(
        eq(accountingInvoices.organizationId, tenant.organizationId),
        eq(accountingInvoices.invoiceNumber, parsed.data.invoiceNumber),
      ),
    )
    .limit(1);
  if (existing.length) return c.json({ error: 'Invoice number already exists' }, 409);

  const [invoice] = await db
    .insert(accountingInvoices)
    .values({ ...parsed.data, organizationId: tenant.organizationId, createdBy: tenant.userId })
    .returning();

  await audit(c, 'accounting.invoice.create', 'accounting_invoice', invoice.id, {
    invoiceNumber: invoice.invoiceNumber,
  });
  return c.json({ invoice }, 201);
});

accounting.patch('/invoices/:id', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = invoiceSchema.partial().safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [invoice] = await db
    .select()
    .from(accountingInvoices)
    .where(
      and(
        eq(accountingInvoices.id, id),
        eq(accountingInvoices.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);

  const [updated] = await db
    .update(accountingInvoices)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(accountingInvoices.id, id))
    .returning();

  await audit(c, 'accounting.invoice.update', 'accounting_invoice', id, parsed.data);
  return c.json({ invoice: updated });
});

accounting.post('/invoices/:id/send', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [invoice] = await db
    .select()
    .from(accountingInvoices)
    .where(
      and(
        eq(accountingInvoices.id, id),
        eq(accountingInvoices.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  if (invoice.status !== 'draft') return c.json({ error: 'Only draft invoices can be sent' }, 400);

  await db
    .update(accountingInvoices)
    .set({ status: 'sent', updatedAt: new Date() })
    .where(eq(accountingInvoices.id, id));
  await audit(c, 'accounting.invoice.send', 'accounting_invoice', id, {});
  return c.json({ ok: true });
});

// Payments
accounting.get('/payments', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const from = c.req.query('from');
  const to = c.req.query('to');
  const status = c.req.query('status');

  const conditions = [eq(accountingPayments.organizationId, tenant.organizationId)];
  if (from) conditions.push(gte(accountingPayments.date, from));
  if (to) conditions.push(lte(accountingPayments.date, to));
  if (status) conditions.push(eq(accountingPayments.status, status));

  const payments = await db
    .select()
    .from(accountingPayments)
    .where(and(...conditions))
    .orderBy(desc(accountingPayments.date));
  return c.json({ payments });
});

accounting.post('/payments', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [payment] = await db
    .insert(accountingPayments)
    .values({ ...parsed.data, organizationId: tenant.organizationId, createdBy: tenant.userId })
    .returning();

  await audit(c, 'accounting.payment.create', 'accounting_payment', payment.id, {
    paymentNumber: payment.paymentNumber,
  });
  return c.json({ payment }, 201);
});

accounting.post('/payments/:id/complete', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const id = c.req.param('id');
  const [payment] = await db
    .select()
    .from(accountingPayments)
    .where(
      and(
        eq(accountingPayments.id, id),
        eq(accountingPayments.organizationId, tenant.organizationId),
      ),
    )
    .limit(1);
  if (!payment) return c.json({ error: 'Payment not found' }, 404);
  if (payment.status !== 'pending')
    return c.json({ error: 'Only pending payments can be completed' }, 400);

  await db
    .update(accountingPayments)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(eq(accountingPayments.id, id));

  // If linked to invoice, update invoice status
  if (payment.invoiceId) {
    const [invoice] = await db
      .select()
      .from(accountingInvoices)
      .where(eq(accountingInvoices.id, payment.invoiceId))
      .limit(1);
    if (invoice) {
      const paidAmount = await db
        .select({ total: sum(accountingPayments.amount) })
        .from(accountingPayments)
        .where(
          and(
            eq(accountingPayments.invoiceId, invoice.id),
            eq(accountingPayments.status, 'completed'),
          ),
        );
      const paid = Number(paidAmount[0]?.total || 0);
      if (paid >= invoice.total) {
        await db
          .update(accountingInvoices)
          .set({ status: 'paid', updatedAt: new Date() })
          .where(eq(accountingInvoices.id, invoice.id));
      }
    }
  }

  await audit(c, 'accounting.payment.complete', 'accounting_payment', id, {});
  return c.json({ ok: true });
});

// Tax Rates
accounting.get('/tax-rates', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const rates = await db
    .select()
    .from(accountingTaxRates)
    .where(eq(accountingTaxRates.organizationId, tenant.organizationId))
    .orderBy(accountingTaxRates.name);
  return c.json({ taxRates: rates });
});

accounting.post('/tax-rates', requirePermission('accounting.manage'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const body = await c.req.json();
  const parsed = taxRateSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'ValidationError', details: parsed.error.flatten() }, 422);

  const [rate] = await db
    .insert(accountingTaxRates)
    .values({ ...parsed.data, organizationId: tenant.organizationId })
    .returning();

  await audit(c, 'accounting.tax_rate.create', 'accounting_tax_rate', rate.id, { name: rate.name });
  return c.json({ taxRate: rate }, 201);
});

// Reports
accounting.get('/reports/trial-balance', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const asOf = c.req.query('asOf') ? parseDate(c.req.query('asOf')!) : new Date();

  const accounts = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.organizationId, tenant.organizationId),
        eq(accountingAccounts.isActive, true),
      ),
    )
    .orderBy(accountingAccounts.code);

  const lines = accounts.map((acc) => ({
    code: acc.code,
    name: acc.name,
    type: acc.type,
    balance: acc.balance,
  }));

  const totalDebits = lines
    .filter((l) => ['asset', 'expense'].includes(l.type))
    .reduce((s, l) => s + l.balance, 0);
  const totalCredits = lines
    .filter((l) => ['liability', 'equity', 'revenue'].includes(l.type))
    .reduce((s, l) => s + l.balance, 0);

  return c.json({
    lines,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
    asOf: toDateString(asOf),
  });
});

accounting.get('/reports/pnl', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const from = c.req.query('from')
    ? parseDate(c.req.query('from')!)
    : new Date(new Date().getFullYear(), 0, 1);
  const to = c.req.query('to') ? parseDate(c.req.query('to')!) : new Date();

  const fromStr = toDateString(from);
  const toStr = toDateString(to);

  const entries = await db
    .select({
      line: accountingJournalLines,
      entry: accountingJournalEntries,
    })
    .from(accountingJournalLines)
    .leftJoin(
      accountingJournalEntries,
      eq(accountingJournalLines.entryId, accountingJournalEntries.id),
    )
    .where(
      and(
        eq(accountingJournalLines.organizationId, tenant.organizationId),
        eq(accountingJournalEntries.status, 'posted'),
        gte(accountingJournalEntries.date, fromStr),
        lte(accountingJournalEntries.date, toStr),
      ),
    );

  const accounts = await db
    .select()
    .from(accountingAccounts)
    .where(eq(accountingAccounts.organizationId, tenant.organizationId));

  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const revenueLines = [];
  const expenseLines = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const e of entries) {
    const acc = accountMap.get(e.line.accountId);
    if (!acc) continue;
    if (acc.type === 'revenue') {
      revenueLines.push({ code: acc.code, name: acc.name, amount: e.line.credit - e.line.debit });
      totalRevenue += e.line.credit - e.line.debit;
    } else if (acc.type === 'expense') {
      expenseLines.push({ code: acc.code, name: acc.name, amount: e.line.debit - e.line.credit });
      totalExpense += e.line.debit - e.line.credit;
    }
  }

  return c.json({
    revenue: revenueLines,
    expenses: expenseLines,
    totalRevenue,
    totalExpense,
    netIncome: totalRevenue - totalExpense,
    period: { from: fromStr, to: toStr },
  });
});

accounting.get('/reports/balance-sheet', async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const asOf = c.req.query('asOf') ? parseDate(c.req.query('asOf')!) : new Date();

  const accounts = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.organizationId, tenant.organizationId),
        eq(accountingAccounts.isActive, true),
      ),
    )
    .orderBy(accountingAccounts.code);

  const assets = accounts
    .filter((a) => a.type === 'asset')
    .map((a) => ({ code: a.code, name: a.name, balance: a.balance }));
  const liabilities = accounts
    .filter((a) => a.type === 'liability')
    .map((a) => ({ code: a.code, name: a.name, balance: a.balance }));
  const equity = accounts
    .filter((a) => a.type === 'equity')
    .map((a) => ({ code: a.code, name: a.name, balance: a.balance }));

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

  return c.json({
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
    asOf: toDateString(asOf),
  });
});

export default accounting;
