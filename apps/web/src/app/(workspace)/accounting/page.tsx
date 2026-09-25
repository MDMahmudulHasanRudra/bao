'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Account = {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  currency: string;
  isActive: boolean;
  description: string | null;
};

type JournalLine = {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  description: string | null;
};

type JournalEntry = {
  id: string;
  entryNumber: string;
  date: string;
  description: string | null;
  reference: string | null;
  status: 'draft' | 'posted' | 'void';
  postedAt: string | null;
  lines?: JournalLine[];
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  status: 'draft' | 'sent' | 'paid' | 'void';
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
};

type TrialBalance = {
  lines: { accountId: string; code: string; name: string; type: string; balance: number }[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
  asOf: string;
};

type Pnl = {
  revenue: { code: string; name: string; amount: number }[];
  expenses: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  period: { from: string; to: string };
};

type BalanceSheet = {
  assets: { code: string; name: string; balance: number }[];
  liabilities: { code: string; name: string; balance: number }[];
  equity: { code: string; name: string; balance: number }[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
};

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

const TABS = ['Chart of Accounts', 'Journal Entries', 'Invoices', 'Reports'] as const;
type Tab = (typeof TABS)[number];

function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    sent: 'bg-indigo-100 text-indigo-700',
    paid: 'bg-emerald-100 text-emerald-700',
    posted: 'bg-emerald-100 text-emerald-700',
    void: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
    </span>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 text-left font-medium text-slate-600 ${className}`}>
      {children}
    </th>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-slate-500">{children}</p>;
}

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('Chart of Accounts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);

  const [accountForm, setAccountForm] = useState({
    code: '',
    name: '',
    type: 'asset' as Account['type'],
  });
  const [entryForm, setEntryForm] = useState({
    entryNumber: '',
    date: today(),
    description: '',
    lines: [
      { accountId: '', debit: 0, credit: 0 },
      { accountId: '', debit: 0, credit: 0 },
    ],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, e, i, tb, pl, bs] = await Promise.all([
        api<{ accounts: Account[] }>('/api/v1/accounting/accounts'),
        api<{ entries: JournalEntry[] }>('/api/v1/accounting/journal-entries'),
        api<{ invoices: Invoice[] }>('/api/v1/accounting/invoices'),
        api<TrialBalance>('/api/v1/accounting/reports/trial-balance'),
        api<Pnl>('/api/v1/accounting/reports/pnl'),
        api<BalanceSheet>('/api/v1/accounting/reports/balance-sheet'),
      ]);
      setAccounts(a.accounts);
      setEntries(e.entries);
      setInvoices(i.invoices);
      setTrialBalance(tb);
      setPnl(pl);
      setBalanceSheet(bs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounting data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createAccount = useCallback(async () => {
    setBusy('account');
    setFlash(null);
    try {
      await api('/api/v1/accounting/accounts', { method: 'POST', body: accountForm });
      setFlash({ ok: true, text: 'Account created' });
      setAccountForm({ code: '', name: '', type: 'asset' });
      await load();
    } catch (err) {
      setFlash({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to create account',
      });
    } finally {
      setBusy(null);
    }
  }, [accountForm, load]);

  const createEntry = useCallback(async () => {
    setBusy('entry');
    setFlash(null);
    try {
      await api('/api/v1/accounting/journal-entries', { method: 'POST', body: entryForm });
      setFlash({ ok: true, text: 'Journal entry created' });
      setEntryForm({
        entryNumber: '',
        date: today(),
        description: '',
        lines: [
          { accountId: '', debit: 0, credit: 0 },
          { accountId: '', debit: 0, credit: 0 },
        ],
      });
      await load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to create entry' });
    } finally {
      setBusy(null);
    }
  }, [entryForm, load]);

  const postEntry = useCallback(
    async (id: string) => {
      setBusy(`post-${id}`);
      setFlash(null);
      try {
        await api(`/api/v1/accounting/journal-entries/${id}/post`, { method: 'POST' });
        setFlash({ ok: true, text: 'Entry posted' });
        await load();
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to post entry' });
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const sendInvoice = useCallback(
    async (id: string) => {
      setBusy(`send-${id}`);
      setFlash(null);
      try {
        await api(`/api/v1/accounting/invoices/${id}/send`, { method: 'POST' });
        setFlash({ ok: true, text: 'Invoice sent' });
        await load();
      } catch (err) {
        setFlash({
          ok: false,
          text: err instanceof Error ? err.message : 'Failed to send invoice',
        });
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const entryTotals = entryForm.lines.reduce(
    (acc, l) => ({
      debit: acc.debit + Number(l.debit || 0),
      credit: acc.credit + Number(l.credit || 0),
    }),
    { debit: 0, credit: 0 },
  );

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading accounting…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Accounting</h1>
        <p className="mt-1 text-sm text-slate-500">
          Chart of accounts, journal entries, invoicing, and financial reports.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {flash && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {flash.text}
        </div>
      )}

      <div
        className="flex flex-wrap gap-2 border-b border-slate-200"
        role="tablist"
        aria-label="Accounting sections"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Chart of Accounts' && (
        <div className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createAccount();
            }}
          >
            <div>
              <label htmlFor="acc-code" className="block text-xs font-medium text-slate-600">
                Code
              </label>
              <input
                id="acc-code"
                required
                value={accountForm.code}
                onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })}
                className="mt-1 w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="1000"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="acc-name" className="block text-xs font-medium text-slate-600">
                Name
              </label>
              <input
                id="acc-name"
                required
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Cash on Hand"
              />
            </div>
            <div>
              <label htmlFor="acc-type" className="block text-xs font-medium text-slate-600">
                Type
              </label>
              <select
                id="acc-type"
                value={accountForm.type}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, type: e.target.value as Account['type'] })
                }
                className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={busy === 'account'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Account
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Code</Th>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <Empty>No accounts yet. Add your first account above.</Empty>
                    </td>
                  </tr>
                ) : (
                  accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-mono text-slate-700">{a.code}</td>
                      <td className="px-4 py-3 text-slate-900">{a.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">
                          {a.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {money(a.balance, a.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Journal Entries' && (
        <div className="space-y-4">
          <form
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void createEntry();
            }}
          >
            <div className="flex flex-wrap gap-3">
              <div>
                <label htmlFor="je-num" className="block text-xs font-medium text-slate-600">
                  Entry #
                </label>
                <input
                  id="je-num"
                  required
                  value={entryForm.entryNumber}
                  onChange={(e) => setEntryForm({ ...entryForm, entryNumber: e.target.value })}
                  className="mt-1 w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="JE-001"
                />
              </div>
              <div>
                <label htmlFor="je-date" className="block text-xs font-medium text-slate-600">
                  Date
                </label>
                <input
                  id="je-date"
                  type="date"
                  required
                  value={entryForm.date}
                  onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                  className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="je-desc" className="block text-xs font-medium text-slate-600">
                  Description
                </label>
                <input
                  id="je-desc"
                  value={entryForm.description}
                  onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Month-end accruals"
                />
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th className="text-right">Debit</Th>
                  <Th className="text-right">Credit</Th>
                </tr>
              </thead>
              <tbody>
                {entryForm.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <select
                        aria-label={`Line ${i + 1} account`}
                        required
                        value={line.accountId}
                        onChange={(e) => {
                          const lines = [...entryForm.lines];
                          lines[i] = { ...line, accountId: e.target.value };
                          setEntryForm({ ...entryForm, lines });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">Select account…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        aria-label={`Line ${i + 1} debit`}
                        type="number"
                        min={0}
                        step={1}
                        value={line.debit || ''}
                        onChange={(e) => {
                          const lines = [...entryForm.lines];
                          lines[i] = { ...line, debit: Number(e.target.value) };
                          setEntryForm({ ...entryForm, lines });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        aria-label={`Line ${i + 1} credit`}
                        type="number"
                        min={0}
                        step={1}
                        value={line.credit || ''}
                        onChange={(e) => {
                          const lines = [...entryForm.lines];
                          lines[i] = { ...line, credit: Number(e.target.value) };
                          setEntryForm({ ...entryForm, lines });
                        }}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 text-xs text-slate-600">
                  <td className="px-4 py-2">
                    Totals — debits {money(entryTotals.debit)} / credits {money(entryTotals.credit)}{' '}
                    {entryTotals.debit === entryTotals.credit ? '(balanced)' : '(must balance)'}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>

            <div className="flex items-center gap-2">
              {entryForm.lines.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setEntryForm({
                      ...entryForm,
                      lines: [...entryForm.lines, { accountId: '', debit: 0, credit: 0 }],
                    })
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Add line
                </button>
              )}
              <button
                type="submit"
                disabled={
                  busy === 'entry' ||
                  entryTotals.debit !== entryTotals.credit ||
                  entryTotals.debit === 0
                }
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Create Entry
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Entry #</Th>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <Empty>No journal entries yet.</Empty>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-mono text-slate-700">{entry.entryNumber}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.date}</td>
                      <td className="px-4 py-3 text-slate-900">{entry.description || '—'}</td>
                      <td className="px-4 py-3">{statusBadge(entry.status)}</td>
                      <td className="px-4 py-3 text-right">
                        {entry.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => void postEntry(entry.id)}
                            disabled={busy === `post-${entry.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Post
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Invoices' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Invoice #</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <Empty>No invoices yet.</Empty>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-mono text-slate-700">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.date}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.dueDate || '—'}</td>
                    <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {money(inv.total, inv.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => void sendInvoice(inv.id)}
                          disabled={busy === `send-${inv.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Send
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Reports' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Trial Balance</h2>
              {trialBalance && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    trialBalance.balanced
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {trialBalance.balanced ? 'Balanced' : 'Out of balance'}
                </span>
              )}
            </div>
            {trialBalance && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Code</Th>
                      <Th>Name</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Balance</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {trialBalance.lines.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          <Empty>No balances as of {trialBalance.asOf}.</Empty>
                        </td>
                      </tr>
                    ) : (
                      trialBalance.lines.map((l) => (
                        <tr key={l.accountId}>
                          <td className="px-4 py-3 font-mono text-slate-700">{l.code}</td>
                          <td className="px-4 py-3 text-slate-900">{l.name}</td>
                          <td className="px-4 py-3 capitalize text-slate-500">{l.type}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {money(l.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="border-t border-slate-200 text-sm font-medium text-slate-900">
                    <tr>
                      <td className="px-4 py-3" colSpan={3}>
                        Totals
                      </td>
                      <td className="px-4 py-3 text-right">
                        {money(trialBalance.totalDebits)} / {money(trialBalance.totalCredits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {pnl && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Profit &amp; Loss</h2>
              <p className="mt-1 text-xs text-slate-500">
                {pnl.period.from} → {pnl.period.to}
              </p>
              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Revenue</h3>
                  {pnl.revenue.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No revenue in period.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {pnl.revenue.map((r) => (
                        <li key={r.code} className="flex justify-between text-slate-700">
                          <span>
                            {r.code} — {r.name}
                          </span>
                          <span className="font-medium">{money(r.amount)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                        <span>Total revenue</span>
                        <span>{money(pnl.totalRevenue)}</span>
                      </li>
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Expenses</h3>
                  {pnl.expenses.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No expenses in period.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {pnl.expenses.map((x) => (
                        <li key={x.code} className="flex justify-between text-slate-700">
                          <span>
                            {x.code} — {x.name}
                          </span>
                          <span className="font-medium">{money(x.amount)}</span>
                        </li>
                      ))}
                      <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                        <span>Total expenses</span>
                        <span>{money(pnl.totalExpense)}</span>
                      </li>
                    </ul>
                  )}
                </div>
              </div>
              <p className="mt-4 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
                Net income:{' '}
                <span className={pnl.netIncome < 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {money(pnl.netIncome)}
                </span>
              </p>
            </div>
          )}

          {balanceSheet && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">Balance Sheet</h2>
              <div className="mt-4 grid gap-6 md:grid-cols-3">
                {(
                  [
                    ['Assets', balanceSheet.assets, balanceSheet.totalAssets],
                    ['Liabilities', balanceSheet.liabilities, balanceSheet.totalLiabilities],
                    ['Equity', balanceSheet.equity, balanceSheet.totalEquity],
                  ] as const
                ).map(([label, lines, total]) => (
                  <div key={label}>
                    <h3 className="text-sm font-medium text-slate-700">{label}</h3>
                    {lines.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-500">None</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {lines.map((l) => (
                          <li key={l.code} className="flex justify-between text-slate-700">
                            <span>{l.name}</span>
                            <span className="font-medium">{money(l.balance)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                          <span>Total</span>
                          <span>{money(total)}</span>
                        </li>
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
