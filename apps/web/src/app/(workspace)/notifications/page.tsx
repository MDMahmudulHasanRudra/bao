'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
};

type NotificationsPayload = {
  notifications: Notification[];
  unreadCount: number;
};

const TYPE_BADGES: Record<string, string> = {
  'member.invite': 'bg-indigo-100 text-indigo-700',
  'member.role_change': 'bg-violet-100 text-violet-700',
  'knowledge.ready': 'bg-emerald-100 text-emerald-700',
  'assistant.reply': 'bg-sky-100 text-sky-700',
  'proposal.approve': 'bg-amber-100 text-amber-800',
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<NotificationsPayload>('/api/v1/notifications');
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(n: Notification) {
    setBusy(true);
    setFlash(null);
    try {
      await api(`/api/v1/notifications/${n.id}/read`, { method: 'PUT' });
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      setFlash({ ok: true, text: 'Marked as read.' });
    } catch (e) {
      setFlash({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    setFlash(null);
    try {
      await api('/api/v1/notifications/read-all', { method: 'PUT' });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt || now })));
      setUnreadCount(0);
      setFlash({ ok: true, text: 'All notifications marked as read.' });
    } catch (e) {
      setFlash({ ok: false, text: errMsg(e) });
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
        Loading notifications…
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
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={busy || unreadCount === 0}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Mark all read'}
          </button>
        </div>
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

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-600">No notifications yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Invites, role changes, knowledge readiness, and proposal approvals will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const unread = !n.readAt;
            const badge = TYPE_BADGES[n.type] || 'bg-slate-100 text-slate-600';
            return (
              <li
                key={n.id}
                className={`rounded-xl border p-4 ${
                  unread ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}
                      >
                        {n.type}
                      </span>
                      {unread && (
                        <>
                          <span className="sr-only">Unread</span>
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full bg-indigo-500"
                          />
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                      {n.link && (
                        <Link
                          href={n.link}
                          className="font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Open →
                        </Link>
                      )}
                    </div>
                  </div>
                  {unread && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markRead(n)}
                      className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
