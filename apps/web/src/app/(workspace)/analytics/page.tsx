'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type SalesStats = {
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  totalValue: number;
  avgValue: number;
  conversionRate: number;
};

type KnowledgeStats = {
  totalSources: number;
  readySources: number;
  totalChunks: number;
};

type CompareResult = {
  jobId: string;
  status: string;
  score?: number;
  summary?: string;
  differences?: { type: string; content: string }[];
  mock?: boolean;
  note?: string;
  error?: string;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

function Card({
  label,
  value,
  source,
  emptyWhen,
  emptyText,
}: {
  label: string;
  value: string | number;
  source: string;
  emptyWhen?: boolean;
  emptyText?: string;
}) {
  const isEmpty = emptyWhen ?? (typeof value === 'number' && value === 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{isEmpty ? '—' : value}</p>
      <p className="mt-1 text-xs text-slate-500">
        {isEmpty && emptyText ? emptyText : `Source: ${source}`}
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState<SalesStats | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeStats | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [contentA, setContentA] = useState('');
  const [contentB, setContentB] = useState('');
  const [comparison, setComparison] = useState<CompareResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, k] = await Promise.all([
        api<{ stats: SalesStats }>('/api/v1/analytics/sales'),
        api<{ stats: KnowledgeStats }>('/api/v1/analytics/knowledge'),
      ]);
      setSales(s.stats);
      setKnowledge(k.stats);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runCompare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    setComparison(null);
    try {
      const res = await api<{ comparison: CompareResult }>('/api/v1/analytics/compare', {
        method: 'POST',
        body: { contentA, contentB, type: 'text' },
      });
      setComparison(res.comparison);
      setFlash({
        ok: true,
        text: res.comparison.mock
          ? 'Comparison completed (mock — Diffy not configured).'
          : 'Comparison completed.',
      });
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
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
        Loading analytics…
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

  const noLeads = (sales?.totalLeads ?? 0) === 0;
  const noSources = (knowledge?.totalSources ?? 0) === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500">
            Organization-scoped sales and knowledge metrics from live data.
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

      <section aria-label="Sales metrics">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Sales</h2>
        {noLeads ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No leads yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create a lead in Sales — pipeline metrics appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card
              label="Total leads"
              value={sales?.totalLeads ?? 0}
              source="analytics/sales"
              emptyText="No leads in this org"
            />
            <Card
              label="Won deals"
              value={sales?.wonLeads ?? 0}
              source="analytics/sales · stage=closed_won"
              emptyText="No won deals yet"
            />
            <Card
              label="Lost deals"
              value={sales?.lostLeads ?? 0}
              source="analytics/sales · stage=closed_lost"
              emptyText="No lost deals"
            />
            <Card
              label="Won value"
              value={`$${(sales?.totalValue ?? 0).toLocaleString()}`}
              source="analytics/sales · sum(won value)"
              emptyWhen={!sales?.totalValue}
              emptyText="No closed revenue"
            />
            <Card
              label="Avg open value"
              value={`$${(sales?.avgValue ?? 0).toLocaleString()}`}
              source="analytics/sales · avg(open)"
              emptyWhen={!sales?.avgValue}
              emptyText="No open pipeline"
            />
            <Card
              label="Conversion rate"
              value={`${sales?.conversionRate ?? 0}%`}
              source="analytics/sales · won/total"
              emptyWhen={noLeads}
              emptyText="Needs at least one lead"
            />
          </div>
        )}
      </section>

      <section aria-label="Knowledge metrics">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Knowledge</h2>
        {noSources ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No knowledge sources yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Upload a document or add a URL in Knowledge Hub — readiness metrics appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card
              label="Total sources"
              value={knowledge?.totalSources ?? 0}
              source="analytics/knowledge"
              emptyText="No sources"
            />
            <Card
              label="Ready sources"
              value={knowledge?.readySources ?? 0}
              source="analytics/knowledge · status=ready"
              emptyText="Nothing ready yet"
            />
            <Card
              label="Chunks indexed"
              value={knowledge?.totalChunks ?? 0}
              source="analytics/knowledge · sum(chunk_count)"
              emptyText="No chunks yet"
            />
          </div>
        )}
      </section>

      <section
        aria-label="Compare with Diffy"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold text-slate-800">Compare content (Diffy)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Side-by-side comparison for AI outputs or drafts. Result is audited.
        </p>

        {flash && (
          <p
            role={flash.ok ? 'status' : 'alert'}
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              flash.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {flash.text}
          </p>
        )}

        <form onSubmit={(e) => void runCompare(e)} className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor="cmp-a" className="block text-xs font-medium text-slate-600">
              Content A <span aria-hidden>*</span>
            </label>
            <textarea
              id="cmp-a"
              required
              rows={5}
              value={contentA}
              onChange={(e) => setContentA(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="First version or draft…"
            />
          </div>
          <div>
            <label htmlFor="cmp-b" className="block text-xs font-medium text-slate-600">
              Content B <span aria-hidden>*</span>
            </label>
            <textarea
              id="cmp-b"
              required
              rows={5}
              value={contentB}
              onChange={(e) => setContentB(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Second version or draft…"
            />
          </div>
          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={busy || !contentA.trim() || !contentB.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Comparing…' : 'Run comparison'}
            </button>
          </div>
        </form>

        {comparison && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4" role="status">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-700">
                {comparison.status}
              </span>
              {typeof comparison.score === 'number' && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
                  score {comparison.score}
                </span>
              )}
              {comparison.mock && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">
                  Mock
                </span>
              )}
              <span className="text-slate-500">job {comparison.jobId}</span>
            </div>
            {comparison.summary && (
              <p className="mt-2 text-sm text-slate-700">{comparison.summary}</p>
            )}
            {comparison.differences && comparison.differences.length > 0 && (
              <ul className="mt-2 space-y-1">
                {comparison.differences.map((d, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="font-medium capitalize">{d.type}:</span> {d.content}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              Source: diffy.compare audit · {comparison.mock ? 'Diffy not configured' : 'Diffy API'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
