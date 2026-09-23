'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type Template = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};

type Proposal = {
  id: string;
  title: string;
  content?: string | null;
  status: string;
  version?: number | null;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  approved: 'bg-emerald-100 text-emerald-700',
};

export default function ProposalsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [editContent, setEditContent] = useState('');

  const selected = proposals.find((p) => p.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, t] = await Promise.all([
        api<{ proposals: Proposal[] }>('/api/v1/proposals'),
        api<{ templates: Template[] }>('/api/v1/proposals/templates'),
      ]);
      setProposals(p.proposals || []);
      setTemplates(t.templates || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEditContent(selected?.content || '');
  }, [selectedId, selected?.content]);

  function flashMsg(message: string, isError = false) {
    setFlash({ ok: !isError, text: message });
  }

  async function createProposal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const template = templates.find((t) => t.id === newTemplateId);
      const body: Record<string, unknown> = { title: newTitle.trim() };
      if (newTemplateId) body.templateId = newTemplateId;
      if (newContent.trim() || template) {
        body.content = newContent.trim() || template?.content || '';
      }
      const res = await api<{ proposal: Proposal }>('/api/v1/proposals', {
        method: 'POST',
        body,
      });
      setProposals((prev) => [res.proposal, ...prev]);
      setSelectedId(res.proposal.id);
      setNewTitle('');
      setNewContent('');
      setNewTemplateId('');
      flashMsg('Proposal created.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const res = await api<{ template: Template }>('/api/v1/proposals/templates', {
        method: 'POST',
        body: { name: tplName.trim(), content: tplContent },
      });
      setTemplates((prev) => [res.template, ...prev]);
      setTplName('');
      setTplContent('');
      flashMsg('Template saved.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function saveContent() {
    if (!selected) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await api<{ proposal: Proposal }>(`/api/v1/proposals/${selected.id}`, {
        method: 'PUT',
        body: { content: editContent },
      });
      setProposals((prev) => prev.map((p) => (p.id === res.proposal.id ? res.proposal : p)));
      flashMsg(`Saved as version ${res.proposal.version || 1}.`);
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function approve(p: Proposal) {
    if (!window.approve && !window.confirm(`Approve “${p.title}”?`)) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await api<{ proposal: Proposal }>(`/api/v1/proposals/${p.id}/approve`, {
        method: 'POST',
      });
      setProposals((prev) => prev.map((x) => (x.id === res.proposal.id ? res.proposal : x)));
      flashMsg('Proposal approved.');
    } catch (err) {
      flashMsg(errMsg(err), true);
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
        Loading proposals…
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Proposals</h1>
          <p className="text-sm text-slate-500">
            Draft versioned proposals, approve them, and manage templates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Refresh
        </button>
      </div>

      {flash && (
        <p
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-3 py-2 text-sm ${
            flash.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">New proposal</h2>
          <form
            onSubmit={(e) => void createProposal(e)}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div>
              <label htmlFor="proposal-title" className="block text-xs font-medium text-slate-600">
                Title <span aria-hidden>*</span>
              </label>
              <input
                id="proposal-title"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Acme renewal proposal"
              />
            </div>
            <div>
              <label
                htmlFor="proposal-template"
                className="block text-xs font-medium text-slate-600"
              >
                Template
              </label>
              <select
                id="proposal-template"
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">No template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="proposal-content"
                className="block text-xs font-medium text-slate-600"
              >
                Content
              </label>
              <textarea
                id="proposal-content"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Outline scope, pricing, timeline…"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Create proposal'}
            </button>
          </form>

          <h2 className="pt-2 text-sm font-semibold text-slate-800">Templates</h2>
          <form
            onSubmit={(e) => void createTemplate(e)}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div>
              <label htmlFor="tpl-name" className="block text-xs font-medium text-slate-600">
                Name <span aria-hidden>*</span>
              </label>
              <input
                id="tpl-name"
                required
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Standard SOW"
              />
            </div>
            <div>
              <label htmlFor="tpl-content" className="block text-xs font-medium text-slate-600">
                Body <span aria-hidden>*</span>
              </label>
              <textarea
                id="tpl-content"
                required
                value={tplContent}
                onChange={(e) => setTplContent(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !tplName.trim()}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Save template
            </button>
          </form>
          {templates.length === 0 && (
            <p className="text-sm text-slate-500">No templates yet — save one for reuse.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Proposals {proposals.length > 0 && `(${proposals.length})`}
          </h2>
          {proposals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No proposals yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create your first draft on the left — content edits bump the version automatically.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {proposals.map((p) => {
                const active = p.id === selectedId;
                const badge = STATUS_BADGES[p.status] || 'bg-slate-100 text-slate-600';
                return (
                  <li
                    key={p.id}
                    className={`rounded-xl border p-4 ${
                      active ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}
                          >
                            {p.status}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            v{p.version || 1}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{p.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          Updated {new Date(p.updatedAt).toLocaleString()}
                        </p>
                      </button>
                      {p.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void approve(p)}
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                    {active && (
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                        <label
                          htmlFor="edit-content"
                          className="block text-xs font-medium text-slate-600"
                        >
                          Content (editing creates a new version)
                        </label>
                        <textarea
                          id="edit-content"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={8}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveContent()}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : `Save (→ v${(p.version || 1) + 1})`}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
