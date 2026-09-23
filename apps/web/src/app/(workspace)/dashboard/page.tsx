'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';

type DashboardData = {
  pipeline: { stage: string; count: number; totalValue: number }[];
  recentActivities: {
    id: string;
    type: string;
    subject: string;
    createdAt: string;
  }[];
  knowledgeStats: { totalSources: number; readySources: number };
  aiConversationsCount: number;
  unreadNotifications: number;
};

type ModulesPayload = {
  modules: { id: string; name: string; description: string }[];
  comingSoon: { id: string; name: string; description: string }[];
};

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export default function DashboardPage() {
  const user = getUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [modules, setModules] = useState<ModulesPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dash, mods] = await Promise.all([
          api<DashboardData>('/api/v1/dashboard'),
          api<ModulesPayload>('/api/v1/modules'),
        ]);
        if (!cancelled) {
          setData(dash);
          setModules(mods);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading dashboard…</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const totalLeads = data?.pipeline.reduce((s, p) => s + p.count, 0) ?? 0;
  const won = data?.pipeline.find((p) => p.stage === 'closed_won')?.count ?? 0;
  const knowledge = data?.knowledgeStats.totalSources ?? 0;
  const ready = data?.knowledgeStats.readySources ?? 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const stats = [
    { label: 'Total Leads', value: totalLeads },
    { label: 'Won Deals', value: won },
    { label: 'Knowledge Assets', value: knowledge },
    { label: 'AI Chats', value: data?.aiConversationsCount ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {greeting}, {user?.name?.split(' ')[0] || 'there'}! 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening today.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{s.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-[#0b1220] p-5 text-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Sales Pipeline</h2>
              <p className="text-xs text-slate-400">Deal stage distribution</p>
            </div>
          </div>
          <ul className="space-y-2">
            {(data?.pipeline || []).length === 0 ? (
              <li className="text-sm text-slate-400">No leads yet.</li>
            ) : (
              data!.pipeline.map((row) => (
                <li
                  key={row.stage}
                  className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm"
                >
                  <span>{STAGE_LABELS[row.stage] || row.stage}</span>
                  <span className="font-medium">
                    {row.count}
                    <span className="ml-3 text-slate-400">${row.totalValue.toLocaleString()}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Activity</h2>
            <span className="text-xs text-slate-500">Unread: {data?.unreadNotifications ?? 0}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {(data?.recentActivities || []).length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No recent activity.</li>
            ) : (
              data!.recentActivities.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{a.subject}</p>
                    <p className="text-xs capitalize text-slate-500">{a.type}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Knowledge Hub</h2>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{ready}</p>
          <p className="text-sm text-slate-500">ready of {knowledge} sources</p>
          <Link
            href="/knowledge"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/knowledge"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              Upload Document
            </Link>
            <Link
              href="/sales"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              New Lead
            </Link>
            <Link
              href="/proposals"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              Create Proposal
            </Link>
            <Link
              href="/assistant"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              Ask AI
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">AI Usage</h2>
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {data?.aiConversationsCount ?? 0}
          </p>
          <p className="text-sm text-slate-500">conversations</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">Your Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(modules?.modules || []).map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900">{m.name}</p>
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  Active
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{m.description}</p>
            </div>
          ))}
          {(modules?.comingSoon || []).slice(0, 4).map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-dashed border-slate-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-700">{m.name}</p>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  Soon
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{m.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
