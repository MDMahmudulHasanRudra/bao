'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type Presentation = {
  id: string;
  title: string;
  status: string;
  outputUrl?: string | null;
  proposalId?: string | null;
  providerJobId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type Proposal = { id: string; title: string; status: string };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600' },
  processing: { label: 'Processing', cls: 'bg-sky-100 text-sky-700' },
  ready: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
};

const ACTIVE = new Set(['pending', 'processing']);

export default function PresentationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Presentation[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [proposalId, setProposalId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, props] = await Promise.all([
        api<{ presentations: Presentation[] }>('/api/v1/presentations'),
        api<{ proposals: Proposal[] }>('/api/v1/proposals'),
      ]);
      setItems(p.presentations || []);
      setProposals(props.proposals || []);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flashMsg(message: string, isError = false) {
    setFlash({ ok: !isError, text: message });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const body: Record<string, unknown> = { title: title.trim() };
      if (content.trim()) body.content = content.trim();
      if (proposalId) body.proposalId = proposalId;
      const res = await api<{ presentation: Presentation }>('/api/v1/presentations', {
        method: 'POST',
        body,
      });
      setItems((prev) => [res.presentation, ...prev]);
      setTitle('');
      setContent('');
      setProposalId('');
      if (res.presentation.status === 'failed') {
        const err = (res.presentation.metadata as { error?: string } | null)?.error;
        flashMsg(err || 'Presentation failed to start. Check Presenton configuration.', true);
      } else {
        flashMsg('Presentation requested.');
      }
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus(p: Presentation) {
    setCheckingId(p.id);
    setFlash(null);
    try {
      const res = await api<{ status: string; outputUrl?: string | null; error?: string }>(
        `/api/v1/presentations/${p.id}/status`,
      );
      setItems((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                status: res.status,
                outputUrl: res.outputUrl ?? x.outputUrl,
                metadata: res.error ? { ...x.metadata, error: res.error } : x.metadata,
              }
            : x,
        ),
      );
      if (res.status === 'failed') flashMsg(res.error || 'Generation failed.', true);
      else if (res.status === 'ready') flashMsg('Presentation is ready.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setCheckingId(null);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading presentations…
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Presentations</h1>
          <p className="text-sm text-slate-500">
            Request AI-generated decks and track status until the output link is ready.
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

      <form
        onSubmit={(e) => void create(e)}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-slate-800">Request a presentation</h2>
        <div>
          <label htmlFor="pres-title" className="block text-xs font-medium text-slate-600">
            Title <span aria-hidden>*</span>
          </label>
          <input
            id="pres-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Q4 board update"
          />
        </div>
        <div>
          <label htmlFor="pres-proposal" className="block text-xs font-medium text-slate-600">
            From proposal (optional)
          </label>
          <select
            id="pres-proposal"
            value={proposalId}
            onChange={(e) => setProposalId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pres-content" className="block text-xs font-medium text-slate-600">
            Brief / content
          </label>
          <textarea
            id="pres-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Audience, key messages, slide count…"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Requesting…' : 'Request presentation'}
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No presentations yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Request one above — status moves from pending to ready, or shows a failure reason.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => {
            const badge = STATUS_BADGES[p.status] || {
              label: p.status,
              cls: 'bg-slate-100 text-slate-600',
            };
            const err = (p.metadata as { error?: string } | null)?.error;
            const isActive = ACTIVE.has(p.status);
            return (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(p.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{p.title}</p>
                    {p.status === 'failed' && err && (
                      <p role="alert" className="mt-1 text-xs text-rose-600">
                        {err}
                      </p>
                    )}
                    {p.status === 'ready' && p.outputUrl && (
                      <a
                        href={p.outputUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Open presentation →
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isActive && (
                      <button
                        type="button"
                        disabled={checkingId === p.id}
                        onClick={() => void checkStatus(p)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
                      >
                        {checkingId === p.id ? 'Checking…' : 'Check status'}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
