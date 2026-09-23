'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorId?: string | null;
  details: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
};

function isPermissionError(err: unknown): boolean {
  return err instanceof Error && /Missing permission|Forbidden/i.test(err.message);
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

const ACTION_BADGES: Record<string, string> = {
  'ai.assistant.run': 'bg-sky-100 text-sky-700',
  'ai.provider.create': 'bg-indigo-100 text-indigo-700',
  'ai.provider.test': 'bg-violet-100 text-violet-700',
  'ai.provider.rotate': 'bg-amber-100 text-amber-800',
  'ai.provider.revoke': 'bg-rose-100 text-rose-700',
  'ai.provider.update': 'bg-indigo-100 text-indigo-700',
  'ai.model_default.update': 'bg-violet-100 text-violet-700',
  'member.invite': 'bg-emerald-100 text-emerald-700',
  'member.role_change': 'bg-emerald-100 text-emerald-700',
  'member.remove': 'bg-rose-100 text-rose-700',
  'user.login': 'bg-slate-100 text-slate-600',
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setUnauthorized(false);
    try {
      const data = await api<{ events: AuditEvent[] }>('/api/v1/audit?limit=100');
      setEvents(data.events || []);
    } catch (err) {
      if (isPermissionError(err)) setUnauthorized(true);
      else setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = filter ? events.filter((e) => e.action.startsWith(filter)) : events;
  const prefixes = [...new Set(events.map((e) => e.action.split('.')[0]))].sort();

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading audit log…
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-lg font-semibold text-amber-900">Audit Log</h1>
        <p className="mt-2 text-sm text-amber-800" role="alert">
          You don’t have permission to view the audit log. Ask an owner or admin.
        </p>
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
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">
            {events.length === 0
              ? 'No events yet'
              : `${visible.length} of ${events.length} recent events · secrets are masked`}
          </p>
        </div>
        <div className="flex gap-2">
          <label htmlFor="audit-filter" className="sr-only">
            Filter by action
          </label>
          <select
            id="audit-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
          >
            <option value="">All actions</option>
            {prefixes.map((p) => (
              <option key={p} value={`${p}.`}>
                {p}.*
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            {events.length === 0 ? 'No audit events yet' : 'No events match this filter'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {events.length === 0
              ? 'Sign-ins, member changes, AI runs, and provider actions will appear here.'
              : 'Clear the filter to see all events.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => {
            const badge = ACTION_BADGES[e.action] || 'bg-slate-100 text-slate-600';
            const detailsText =
              e.details && Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : null;
            return (
              <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}
                      >
                        {e.action}
                      </span>
                      <span className="text-xs text-slate-500">{e.resourceType}</span>
                    </div>
                    {detailsText && (
                      <p className="mt-1 break-all font-mono text-xs text-slate-600">
                        {detailsText}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {e.ipAddress ? `IP ${e.ipAddress} · ` : ''}
                      {e.actorId ? `Actor ${e.actorId.slice(0, 8)} · ` : ''}
                      <time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString()}</time>
                    </p>
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
