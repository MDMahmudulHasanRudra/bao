'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, getUser } from '@/lib/api';
import { errMsg } from '@/lib/errors';

const STAGES = [
  'new',
  'qualified',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const TRANSITIONS: Record<string, string[]> = {
  new: ['qualified'],
  qualified: ['proposal', 'closed_lost'],
  proposal: ['negotiation', 'closed_lost'],
  negotiation: ['closed_won', 'closed_lost'],
  closed_won: [],
  closed_lost: ['new'],
};

const ACTIVITY_TYPES = ['call', 'email', 'meeting', 'note', 'task'];

type Company = {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: string | null;
};

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyId?: string | null;
};

type Lead = {
  id: string;
  title: string;
  stage: string;
  value?: number | null;
  currency?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  ownerId?: string | null;
  expectedCloseDate?: string | null;
};

type Activity = {
  id: string;
  type: string;
  subject: string;
  body?: string | null;
  leadId?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  userId: string;
};

type Tab = 'pipeline' | 'companies' | 'contacts' | 'activities';

function friendlyStageError(message: string) {
  if (/Invalid stage transition/i.test(message)) {
    return `That move isn’t allowed yet. Move the lead through the pipeline step by step. (${message})`;
  }
  return message;
}

export default function SalesPage() {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentUserId = getUser()?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, c, ct, a] = await Promise.all([
        api<{ leads: Lead[] }>('/api/v1/sales/leads'),
        api<{ companies: Company[] }>('/api/v1/sales/companies'),
        api<{ contacts: Contact[] }>('/api/v1/sales/contacts'),
        api<{ activities: Activity[] }>('/api/v1/sales/activities'),
      ]);
      setLeads(l.leads);
      setCompanies(c.companies);
      setContacts(ct.contacts);
      setActivities(a.activities);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(message: string, isError = false) {
    if (isError) {
      setActionError(message);
      setActionSuccess(null);
    } else {
      setActionSuccess(message);
      setActionError(null);
    }
  }

  async function run(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      flash(successMessage);
      await load();
    } catch (e) {
      flash(friendlyStageError(errMsg(e)), true);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading sales workspace…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6">
        <p className="text-sm text-slate-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Leads &amp; CRM</h1>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Refresh
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Sales sections"
        className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const order: Tab[] = ['pipeline', 'companies', 'contacts', 'activities'];
          const i = order.indexOf(tab);
          const next = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
          setTab(next);
          setActionError(null);
          setActionSuccess(null);
          document.getElementById(`sales-tab-${next}`)?.focus();
        }}
      >
        {(
          [
            ['pipeline', 'Pipeline'],
            ['companies', 'Companies'],
            ['contacts', 'Contacts'],
            ['activities', 'Activities'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            id={`sales-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`sales-panel-${id}`}
            onClick={() => {
              setTab(id);
              setActionError(null);
              setActionSuccess(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
        >
          {actionSuccess}
        </p>
      )}

      <div
        role="tabpanel"
        id={`sales-panel-${tab}`}
        aria-labelledby={`sales-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'pipeline' && (
          <PipelineTab
            leads={leads}
            companies={companies}
            busy={busy}
            currentUserId={currentUserId}
            onMove={(lead, stage) =>
              run(async () => {
                await api(`/api/v1/sales/leads/${lead.id}`, { method: 'PUT', body: { stage } });
              }, `Moved “${lead.title}” to ${STAGE_LABELS[stage]}`)
            }
            onCreate={(body) =>
              run(async () => {
                await api('/api/v1/sales/leads', { method: 'POST', body });
              }, 'Lead created')
            }
            onDelete={(lead) =>
              run(async () => {
                await api(`/api/v1/sales/leads/${lead.id}`, { method: 'DELETE' });
              }, 'Lead deleted')
            }
          />
        )}

        {tab === 'companies' && (
          <CompaniesTab
            companies={companies}
            busy={busy}
            onCreate={(body) =>
              run(async () => {
                await api('/api/v1/sales/companies', { method: 'POST', body });
              }, 'Company created')
            }
            onDelete={(c) =>
              run(async () => {
                await api(`/api/v1/sales/companies/${c.id}`, { method: 'DELETE' });
              }, 'Company deleted')
            }
          />
        )}

        {tab === 'contacts' && (
          <ContactsTab
            contacts={contacts}
            companies={companies}
            busy={busy}
            onCreate={(body) =>
              run(async () => {
                await api('/api/v1/sales/contacts', { method: 'POST', body });
              }, 'Contact created')
            }
            onDelete={(c) =>
              run(async () => {
                await api(`/api/v1/sales/contacts/${c.id}`, { method: 'DELETE' });
              }, 'Contact deleted')
            }
          />
        )}

        {tab === 'activities' && (
          <ActivitiesTab
            activities={activities}
            leads={leads}
            busy={busy}
            onCreate={(body) =>
              run(async () => {
                await api('/api/v1/sales/activities', { method: 'POST', body });
              }, 'Activity logged')
            }
            onToggleComplete={(a) =>
              run(
                async () => {
                  await api(`/api/v1/sales/activities/${a.id}`, {
                    method: 'PATCH',
                    body: { completed: !a.completedAt },
                  });
                },
                a.completedAt ? 'Marked open' : 'Marked complete',
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function PipelineTab({
  leads,
  companies,
  busy,
  currentUserId,
  onMove,
  onCreate,
  onDelete,
}: {
  leads: Lead[];
  companies: Company[];
  busy: boolean;
  currentUserId?: string;
  onMove: (lead: Lead, stage: string) => void;
  onCreate: (body: Record<string, unknown>) => void;
  onDelete: (lead: Lead) => void;
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    setFormError(null);
    onCreate({
      title: title.trim(),
      value: value ? Number(value) : undefined,
      companyId: companyId || undefined,
      expectedCloseDate: expectedCloseDate || undefined,
    });
    setTitle('');
    setValue('');
    setCompanyId('');
    setExpectedCloseDate('');
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="New lead"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New lead</h2>
        {formError && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-slate-600">
            Title <span className="text-red-500">*</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              placeholder="Acme renewal"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Value (USD)
            <input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
              placeholder="25000"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Company
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Expected close
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add lead'}
        </button>
      </form>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No leads yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add your first lead above to start the pipeline.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage);
            return (
              <section
                key={stage}
                aria-label={STAGE_LABELS[stage]}
                className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{STAGE_LABELS[stage]}</span>
                  <span>{stageLeads.length}</span>
                </h3>
                {stageLeads.length === 0 && <p className="text-xs text-slate-500">Empty</p>}
                <ul className="space-y-2">
                  {stageLeads.map((lead) => {
                    const nextStages = TRANSITIONS[lead.stage] ?? [];
                    const owned = lead.ownerId && currentUserId && lead.ownerId === currentUserId;
                    return (
                      <li
                        key={lead.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <p className="truncate text-sm font-medium text-slate-900">{lead.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {lead.value != null ? `$${lead.value.toLocaleString()}` : 'No value'}
                          {owned ? ' · Yours' : lead.ownerId ? ' · Team' : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`move-${lead.id}`}>
                            Move {lead.title}
                          </label>
                          <select
                            id={`move-${lead.id}`}
                            value=""
                            disabled={busy || nextStages.length === 0}
                            onChange={(e) => {
                              if (e.target.value) onMove(lead, e.target.value);
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 disabled:opacity-50"
                          >
                            <option value="">
                              {nextStages.length === 0 ? 'No moves' : 'Move to…'}
                            </option>
                            {nextStages.map((s) => (
                              <option key={s} value={s}>
                                {STAGE_LABELS[s]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Delete lead “${lead.title}”?`)) onDelete(lead);
                            }}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompaniesTab({
  companies,
  busy,
  onCreate,
  onDelete,
}: {
  companies: Company[];
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => void;
  onDelete: (c: Company) => void;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    setFormError(null);
    onCreate({ name: name.trim(), domain: domain || undefined, industry: industry || undefined });
    setName('');
    setDomain('');
    setIndustry('');
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="New company"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New company</h2>
        {formError && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600">
            Name <span className="text-red-500">*</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Acme Inc"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Domain
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="acme.com"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Industry
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="SaaS"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add company'}
        </button>
      </form>

      {companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No companies yet</p>
          <p className="mt-1 text-sm text-slate-500">Add a company to group contacts and leads.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[c.industry, c.domain].filter(Boolean).join(' · ') || 'No details'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete company “${c.name}”?`)) onDelete(c);
                }}
                className="mt-3 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactsTab({
  contacts,
  companies,
  busy,
  onCreate,
  onDelete,
}: {
  contacts: Contact[];
  companies: Company[];
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => void;
  onDelete: (c: Contact) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First and last name are required');
      return;
    }
    setFormError(null);
    onCreate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email || undefined,
      companyId: companyId || undefined,
    });
    setFirstName('');
    setLastName('');
    setEmail('');
    setCompanyId('');
  }

  const companyName = (id?: string | null) => companies.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="New contact"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New contact</h2>
        {formError && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-slate-600">
            First name <span className="text-red-500">*</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Last name <span className="text-red-500">*</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Company
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add contact'}
        </button>
      </form>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No contacts yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add people you sell to — link them to a company.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="truncate text-sm font-semibold text-slate-900">
                {c.firstName} {c.lastName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {[c.title, c.email, companyName(c.companyId)].filter(Boolean).join(' · ') ||
                  'No details'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete contact “${c.firstName} ${c.lastName}”?`)) onDelete(c);
                }}
                className="mt-3 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivitiesTab({
  activities,
  leads,
  busy,
  onCreate,
  onToggleComplete,
}: {
  activities: Activity[];
  leads: Lead[];
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => void;
  onToggleComplete: (a: Activity) => void;
}) {
  const [type, setType] = useState('call');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [leadId, setLeadId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      setFormError('Subject is required');
      return;
    }
    setFormError(null);
    onCreate({
      type,
      subject: subject.trim(),
      body: body || undefined,
      leadId: leadId || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    });
    setSubject('');
    setBody('');
    setLeadId('');
    setDueAt('');
  }

  const leadTitle = (id?: string | null) => leads.find((l) => l.id === id)?.title;

  return (
    <div className="space-y-4">
      <form
        onSubmit={submit}
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="Log activity"
      >
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Log activity</h2>
        {formError && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {formError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-slate-600">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Subject <span className="text-red-500">*</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Discovery call"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Lead
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Notes
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional details"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Due
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Log activity'}
        </button>
      </form>

      {activities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No activity yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Log calls, emails, and meetings to build the timeline.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {activities.map((a) => {
            const overdue = a.dueAt && !a.completedAt && new Date(a.dueAt) < new Date();
            return (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium uppercase text-indigo-700">
                    {a.type}
                  </span>
                  <p
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${
                      a.completedAt ? 'text-slate-400 line-through' : 'text-slate-900'
                    }`}
                  >
                    {a.subject}
                  </p>
                  {a.dueAt && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        overdue
                          ? 'bg-rose-50 text-rose-700'
                          : a.completedAt
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {overdue ? 'Overdue' : 'Due'} {new Date(a.dueAt).toLocaleDateString()}
                    </span>
                  )}
                  <time className="text-xs text-slate-500" dateTime={a.createdAt}>
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onToggleComplete(a)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {a.completedAt ? 'Reopen' : 'Complete'}
                  </button>
                </div>
                {a.body && <p className="mt-1 text-sm text-slate-600">{a.body}</p>}
                {a.leadId && leadTitle(a.leadId) && (
                  <p className="mt-1 text-xs text-slate-500">Lead: {leadTitle(a.leadId)}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
