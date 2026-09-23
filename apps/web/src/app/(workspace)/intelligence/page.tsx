'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type Target = {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown> | null;
  enabled: boolean | null;
  createdAt: string;
  updatedAt: string;
};

type Event = {
  id: string;
  targetId: string;
  title: string;
  content?: string | null;
  sourceUrl?: string | null;
  classification?: string | null;
  reviewed: boolean | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

type Tab = 'targets' | 'events';

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function IntelligencePage() {
  const [tab, setTab] = useState<Tab>('targets');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [eventFilter, setEventFilter] = useState<'all' | 'unreviewed' | 'reviewed'>('all');

  const [tName, setTName] = useState('');
  const [tType, setTType] = useState('competitor');
  const [tUrl, setTUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eUrl, setEUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, e] = await Promise.all([
        api<{ targets: Target[] }>('/api/v1/intelligence/targets'),
        api<{ events: Event[] }>('/api/v1/intelligence/events'),
      ]);
      setTargets(t.targets || []);
      setEvents(e.events || []);
    } catch (err) {
      setError(errMsg(err));
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

  const unreviewed = events.filter((e) => !e.reviewed);
  const activeTargets = targets.filter((t) => t.enabled !== false);
  const latestEvent = events[0] || null;
  const withSource = events.filter((e) => e.sourceUrl);

  const filteredEvents =
    eventFilter === 'all'
      ? events
      : eventFilter === 'unreviewed'
        ? events.filter((e) => !e.reviewed)
        : events.filter((e) => e.reviewed);

  async function createTarget(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      const config: Record<string, unknown> = {};
      if (tUrl.trim()) config.url = tUrl.trim();
      const res = await api<{ target: Target }>('/api/v1/intelligence/targets', {
        method: 'POST',
        body: { name: tName.trim(), type: tType, config },
      });
      setTargets((prev) => [res.target, ...prev]);
      setTName('');
      setTUrl('');
      flashMsg('Target created.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function saveTarget(t: Target) {
    setBusy(true);
    setActionId(t.id);
    setFlash(null);
    try {
      const config = { ...(t.config || {}) };
      if (eUrl.trim()) config.url = eUrl.trim();
      const res = await api<{ target: Target }>(`/api/v1/intelligence/targets/${t.id}`, {
        method: 'PUT',
        body: { name: eName.trim() || t.name, config },
      });
      setTargets((prev) => prev.map((x) => (x.id === res.target.id ? res.target : x)));
      setEditingId(null);
      flashMsg('Target saved.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
      setActionId(null);
    }
  }

  async function toggleEnabled(t: Target) {
    setBusy(true);
    setActionId(t.id);
    setFlash(null);
    try {
      const res = await api<{ target: Target }>(`/api/v1/intelligence/targets/${t.id}`, {
        method: 'PUT',
        body: { enabled: t.enabled === false },
      });
      setTargets((prev) => prev.map((x) => (x.id === res.target.id ? res.target : x)));
      flashMsg(res.target.enabled ? 'Target enabled.' : 'Target paused.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
      setActionId(null);
    }
  }

  async function deleteTarget(t: Target) {
    if (!window.confirm(`Delete target “${t.name}”?`)) return;
    setBusy(true);
    setActionId(t.id);
    setFlash(null);
    try {
      await api(`/api/v1/intelligence/targets/${t.id}`, { method: 'DELETE' });
      setTargets((prev) => prev.filter((x) => x.id !== t.id));
      flashMsg('Target deleted.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
      setActionId(null);
    }
  }

  async function scrape(t: Target) {
    setBusy(true);
    setActionId(t.id);
    setFlash(null);
    try {
      const body: Record<string, unknown> = {};
      const cfgUrl = (t.config as { url?: string } | null)?.url;
      if (cfgUrl) body.url = cfgUrl;
      const res = await api<{ event: Event; mock: boolean }>(
        `/api/v1/intelligence/targets/${t.id}/scrape`,
        { method: 'POST', body },
      );
      setEvents((prev) => [res.event, ...prev]);
      flashMsg(
        res.mock
          ? 'Scrape completed (mock — ScrapLink not configured).'
          : 'Scrape completed — event collected.',
      );
      setTab('events');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setBusy(false);
      setActionId(null);
    }
  }

  async function markReviewed(ev: Event) {
    setActionId(ev.id);
    setFlash(null);
    try {
      const res = await api<{ event: Event }>(`/api/v1/intelligence/events/${ev.id}/review`, {
        method: 'PUT',
      });
      setEvents((prev) => prev.map((x) => (x.id === res.event.id ? res.event : x)));
      flashMsg('Marked reviewed.');
    } catch (err) {
      flashMsg(errMsg(err), true);
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading intelligence…
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
          <h1 className="text-lg font-semibold text-slate-900">Monitoring</h1>
          <p className="text-sm text-slate-500">
            Competitor targets, collected events, and evidence-backed insight cards.
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

      {/* Insight cards — source / freshness / empty rules */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Unreviewed events</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{unreviewed.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            Source: intelligence_events ·{' '}
            {unreviewed.length === 0
              ? 'All caught up'
              : `latest ${relTime(unreviewed[0].createdAt)}`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Active targets</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{activeTargets.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            Source: monitoring_targets ·{' '}
            {activeTargets.length === 0
              ? 'No targets configured'
              : `updated ${relTime(activeTargets[0].updatedAt)}`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Collected with source</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{withSource.length}</p>
          <p className="mt-1 text-xs text-slate-400">
            Source: events.sourceUrl ·{' '}
            {latestEvent ? `latest ${relTime(latestEvent.createdAt)}` : 'No collection yet'}
          </p>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(['targets', 'events'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
              tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'targets' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {editingId ? 'Edit target' : 'New target'}
            </h2>
            <form
              onSubmit={(e) => {
                if (editingId) {
                  const t = targets.find((x) => x.id === editingId);
                  if (t)
                    void saveTarget({
                      ...t,
                      name: eName,
                      config: { ...(t.config || {}), url: eUrl },
                    });
                  e.preventDefault();
                } else {
                  void createTarget(e);
                }
              }}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div>
                <label htmlFor="t-name" className="block text-xs font-medium text-slate-600">
                  Name <span aria-hidden>*</span>
                </label>
                <input
                  id="t-name"
                  required
                  value={editingId ? eName : tName}
                  onChange={(e) =>
                    editingId ? setEName(e.target.value) : setTName(e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Acme Corp pricing"
                />
              </div>
              <div>
                <label htmlFor="t-type" className="block text-xs font-medium text-slate-600">
                  Type
                </label>
                <select
                  id="t-type"
                  value={tType}
                  disabled={!!editingId}
                  onChange={(e) => setTType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="competitor">Competitor</option>
                  <option value="market">Market</option>
                  <option value="news">News</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label htmlFor="t-url" className="block text-xs font-medium text-slate-600">
                  URL to monitor
                </label>
                <input
                  id="t-url"
                  type="url"
                  value={editingId ? eUrl : tUrl}
                  onChange={(e) => (editingId ? setEUrl(e.target.value) : setTUrl(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="https://competitor.example.com/pricing"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !(editingId ? eName : tName).trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : editingId ? 'Save target' : 'Create target'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEName('');
                      setEUrl('');
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Targets {targets.length > 0 && `(${targets.length})`}
            </h2>
            {targets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-sm font-medium text-slate-600">No monitoring targets yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Create a competitor or market target on the left, then run a manual scrape.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {targets.map((t) => {
                  const cfgUrl = (t.config as { url?: string } | null)?.url;
                  const enabled = t.enabled !== false;
                  return (
                    <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                enabled
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {enabled ? 'Active' : 'Paused'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                              {t.type}
                            </span>
                            <span className="text-xs text-slate-400">
                              updated {relTime(t.updatedAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-900">{t.name}</p>
                          {cfgUrl && (
                            <a
                              href={cfgUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-block truncate text-xs text-indigo-600 hover:text-indigo-700"
                            >
                              {cfgUrl}
                            </a>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void scrape(t)}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {actionId === t.id ? 'Scraping…' : 'Scrape'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleEnabled(t)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-white"
                          >
                            {enabled ? 'Pause' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditingId(t.id);
                              setEName(t.name);
                              setEUrl(cfgUrl || '');
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-white"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteTarget(t)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'events' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Events {events.length > 0 && `(${filteredEvents.length})`}
            </h2>
            <label htmlFor="ev-filter" className="sr-only">
              Filter events
            </label>
            <select
              id="ev-filter"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="all">All events</option>
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>

          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No events yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create a target and run Scrape — collected events appear here with source and
                freshness.
              </p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No events match this filter</p>
              <button
                type="button"
                onClick={() => setEventFilter('all')}
                className="mt-2 text-sm text-indigo-600 hover:text-indigo-700"
              >
                Show all events
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredEvents.map((ev) => {
                const meta = (ev.metadata || {}) as { mock?: boolean; jobId?: string };
                const target = targets.find((t) => t.id === ev.targetId);
                return (
                  <li
                    key={ev.id}
                    className={`rounded-xl border p-4 ${
                      ev.reviewed
                        ? 'border-slate-200 bg-white'
                        : 'border-indigo-200 bg-indigo-50/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              ev.reviewed
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {ev.reviewed ? 'Reviewed' : 'Unreviewed'}
                          </span>
                          {ev.classification && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                              {ev.classification}
                            </span>
                          )}
                          {meta.mock && (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] text-violet-700">
                              Mock
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            {relTime(ev.createdAt)} · {target?.name || 'unknown target'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{ev.title}</p>
                        {ev.content && (
                          <p className="mt-1 line-clamp-3 text-sm text-slate-600">{ev.content}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          {ev.sourceUrl && (
                            <a
                              href={ev.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:text-indigo-700"
                            >
                              Source ↗
                            </a>
                          )}
                          <span className="text-slate-400">
                            Collected {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {!ev.reviewed && (
                        <button
                          type="button"
                          disabled={actionId === ev.id}
                          onClick={() => void markReviewed(ev)}
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {actionId === ev.id ? 'Saving…' : 'Mark reviewed'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
