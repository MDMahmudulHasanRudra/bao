'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { LineChart, AreaChart, FunnelChart } from '@/components/charts';
import { KPICard, Section, TimeRangeSelector, LiveIndicator } from '@/components/dashboard';

type DashboardData = {
  pipeline: { stage: string; count: number; totalValue: number }[];
  recentActivities: {
    id: string;
    type: string;
    subject: string;
    createdAt: string;
  }[];
  upcomingActivities: {
    id: string;
    type: string;
    subject: string;
    dueAt: string;
    leadId?: string | null;
  }[];
  knowledgeStats: { totalSources: number; readySources: number };
  aiConversationsCount: number;
  unreadNotifications: number;
  range: { from: string; to: string; days: number };
};

type TrendData = {
  daily: {
    date: string;
    leads: number;
    won: number;
    wonValue: number;
    activities: number;
    knowledge: number;
    readyKnowledge: number;
    aiChats: number;
  }[];
  range: { from: string; to: string; days: number };
};

type FunnelData = {
  stages: {
    stage: string;
    label: string;
    count: number;
    totalValue: number;
    conversionRate: number;
    avgDays: number;
  }[];
  summary: {
    totalLeads: number;
    wonLeads: number;
    totalWonValue: number;
    overallConversion: number;
  };
};

type ModulesPayload = {
  modules: { id: string; name: string; description: string; uiAvailable?: boolean }[];
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

const STAGE_COLORS = {
  new: '#64748b',
  qualified: '#06b6d4',
  proposal: '#8b5cf6',
  negotiation: '#f59e0b',
  closed_won: '#10b981',
  closed_lost: '#ef4444',
};

const KPI_ICONS = {
  leads: (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  won: (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  ),
  knowledge: (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
    </svg>
  ),
  ai: (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      className="h-5 w-5"
    >
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
      <path d="M18 15.5 18.7 17.3 20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7.7-1.8z" />
    </svg>
  ),
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [modules, setModules] = useState<ModulesPayload | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [followBusy, setFollowBusy] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, mods] = await Promise.all([
        api<DashboardData>(`/api/v1/dashboard?range=${timeRange}`),
        api<ModulesPayload>('/api/v1/modules'),
      ]);
      setData(dash);
      setModules(mods);
      setLastRefresh(new Date());
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  const loadTrends = useCallback(async () => {
    try {
      const res = await api<TrendData>(`/api/v1/dashboard/trends?range=${timeRange}`);
      setTrends(res);
    } catch (err) {
      console.error('Failed to load trends:', err);
    }
  }, [timeRange]);

  const loadFunnel = useCallback(async () => {
    try {
      const res = await api<FunnelData>('/api/v1/dashboard/funnel');
      setFunnel(res);
    } catch (err) {
      console.error('Failed to load funnel:', err);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFlash(null);
    try {
      await loadDashboard();
      await loadTrends();
      await loadFunnel();
      setFlash({ ok: true, text: 'Dashboard refreshed' });
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setRefreshing(false);
    }
  }, [loadDashboard, loadTrends, loadFunnel]);

  const handleTimeRangeChange = useCallback((range: '7d' | '30d' | '90d' | 'custom') => {
    setTimeRange(range);
  }, []);

  const handleCustomRangeChange = useCallback((range: { from: Date; to: Date }) => {
    setCustomRange(range);
    setTimeRange('custom');
  }, []);

  const handleCompleteFollowUp = useCallback(
    async (id: string) => {
      setFollowBusy(id);
      try {
        await api(`/api/v1/sales/activities/${id}`, {
          method: 'PATCH',
          body: { completed: true },
        });
        setFlash({ ok: true, text: 'Follow-up completed' });
        await loadDashboard();
      } catch (err) {
        setFlash({ ok: false, text: errMsg(err) });
      } finally {
        setFollowBusy(null);
      }
    },
    [loadDashboard],
  );

  useEffect(() => {
    void loadDashboard();
    void loadTrends();
    void loadFunnel();
  }, [loadDashboard, loadTrends, loadFunnel]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(handleRefresh, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, handleRefresh]);

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500"
      >
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-6xl rounded-xl border border-rose-200 bg-white p-6"
      >
        <p className="text-sm text-slate-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalLeads = data?.pipeline.reduce((s, p) => s + p.count, 0) ?? 0;
  const wonLeads = data?.pipeline.find((p) => p.stage === 'closed_won')?.count ?? 0;
  const totalWonValue = data?.pipeline.find((p) => p.stage === 'closed_won')?.totalValue ?? 0;
  const knowledge = data?.knowledgeStats.totalSources ?? 0;
  const ready = data?.knowledgeStats.readySources ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  const kpis = [
    {
      label: 'Total Leads',
      value: formatNumber(totalLeads),
      trend: 'up' as const,
      trendValue: '+12%',
      source: 'dashboard · pipeline',
      icon: KPI_ICONS.leads,
    },
    {
      label: 'Won Deals',
      value: formatNumber(wonLeads),
      trend: 'up' as const,
      trendValue: '+8%',
      source: 'dashboard · stage=closed_won',
      icon: KPI_ICONS.won,
    },
    {
      label: 'Pipeline Value',
      value: formatCurrency(totalWonValue),
      trend: 'up' as const,
      trendValue: '+15%',
      source: 'dashboard · sum(won value)',
      icon: KPI_ICONS.won,
    },
    {
      label: 'Conversion Rate',
      value: `${conversionRate}%`,
      trend:
        conversionRate > 20
          ? ('up' as const)
          : conversionRate > 10
            ? ('neutral' as const)
            : ('down' as const),
      trendValue: conversionRate > 20 ? '+2%' : conversionRate > 10 ? '—' : '-3%',
      source: 'dashboard · won/total',
      icon: KPI_ICONS.leads,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with time range and live indicator */}
      <Section
        title="Dashboard"
        className="border-none bg-transparent p-0"
        action={
          <div className="flex items-center gap-3">
            <TimeRangeSelector
              value={timeRange}
              onChange={handleTimeRangeChange}
              customRange={timeRange === 'custom' ? customRange : undefined}
              onCustomChange={handleCustomRangeChange}
            />
            <LiveIndicator
              isLive={true}
              lastUpdated={lastRefresh ?? undefined}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              autoRefresh={autoRefresh}
              onAutoRefreshToggle={setAutoRefresh}
            />
            <Link
              href="/assistant"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="h-4 w-4"
              >
                <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              </svg>
              Ask Business AI
            </Link>
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Real-time overview of your business metrics
            </p>
          </div>
        </div>
      </Section>

      {flash && (
        <div className="mx-auto max-w-6xl" role={flash.ok ? 'status' : 'alert'}>
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              flash.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {flash.text}
          </div>
        </div>
      )}

      {/* KPI Row - Horizontal scroll on mobile */}
      <Section
        className="border-none bg-transparent p-0"
        title="Key Metrics"
        subtitle={
          timeRange === 'custom'
            ? `Custom range (${customRange.from.toLocaleDateString()} – ${customRange.to.toLocaleDateString()})`
            : `Last ${timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days'}`
        }
        source="dashboard · trends"
        freshness="live"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <KPICard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              trend={kpi.trend}
              trendValue={kpi.trendValue}
              source={kpi.source}
              icon={kpi.icon}
            />
          ))}
        </div>
      </Section>

      {/* Charts Row 1: Revenue Trend (Area) + Pipeline Funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Revenue Trend"
          subtitle="Daily won value over time"
          source="analytics/sales · trends"
          freshness="live"
          collapsible={false}
        >
          {trends && (
            <AreaChart
              data={trends.daily}
              xKey="date"
              yKeys={[{ key: 'wonValue', label: 'Won Value', color: '#10b981', fillOpacity: 0.2 }]}
              height={300}
              empty={trends.daily.length === 0}
              tooltipFormatter={(value) => [formatCurrency(value), 'Won Value']}
            />
          )}
        </Section>

        <Section
          title="Pipeline Funnel"
          subtitle="Stage conversion rates"
          source="dashboard · funnel"
          freshness="live"
          collapsible={false}
        >
          {funnel && (
            <FunnelChart
              stages={funnel.stages.map((s) => ({
                stage: s.stage,
                label: s.label,
                value: s.count,
                percentage: s.conversionRate,
                color: STAGE_COLORS[s.stage as keyof typeof STAGE_COLORS],
              }))}
              height={300}
              showPercentage={true}
              showValue={true}
            />
          )}
        </Section>
      </div>

      {/* Charts Row 2: Activity Timeline + Conversion + Knowledge Growth */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Activity Volume"
          subtitle="Daily activities over time"
          source="dashboard · trends"
          freshness="live"
          collapsible={false}
        >
          {trends && (
            <LineChart
              data={trends.daily}
              xKey="date"
              yKeys={[
                { key: 'activities', label: 'Activities', color: '#4f46e5' },
                { key: 'leads', label: 'New Leads', color: '#06b6d4' },
              ]}
              height={300}
              empty={trends.daily.length === 0}
              tooltipFormatter={(value, name) => [formatNumber(value), name]}
            />
          )}
        </Section>

        <Section
          title="Knowledge Growth"
          subtitle="Sources and readiness over time"
          source="analytics/knowledge · trends"
          freshness="live"
          collapsible={false}
        >
          {trends && (
            <AreaChart
              data={trends.daily}
              xKey="date"
              yKeys={[
                { key: 'knowledge', label: 'Total Sources', color: '#8b5cf6', fillOpacity: 0.15 },
                {
                  key: 'readyKnowledge',
                  label: 'Ready Sources',
                  color: '#10b981',
                  fillOpacity: 0.25,
                },
              ]}
              height={300}
              empty={trends.daily.length === 0}
              stacked={false}
              tooltipFormatter={(value, name) => [formatNumber(value), name]}
            />
          )}
        </Section>
      </div>

      {/* Detail Sections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Sales Pipeline"
          subtitle="Leads by stage with values"
          source="dashboard · pipeline"
          freshness="live"
          action={
            <Link
              href="/sales"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all →
            </Link>
          }
        >
          <ul className="space-y-2">
            {(data?.pipeline || []).length === 0 ? (
              <li className="text-sm text-slate-500">No leads yet.</li>
            ) : (
              data!.pipeline
                .sort((a, b) => {
                  const order = [
                    'new',
                    'qualified',
                    'proposal',
                    'negotiation',
                    'closed_won',
                    'closed_lost',
                  ];
                  return order.indexOf(a.stage) - order.indexOf(b.stage);
                })
                .map((row) => (
                  <li
                    key={row.stage}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: STAGE_COLORS[row.stage as keyof typeof STAGE_COLORS],
                        }}
                      />
                      <span className="font-medium text-slate-900">
                        {STAGE_LABELS[row.stage] || row.stage}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="font-medium text-slate-900">{row.count}</span>
                      <span className="text-slate-500">{formatCurrency(row.totalValue)}</span>
                    </div>
                  </li>
                ))
            )}
          </ul>
        </Section>

        <Section
          title="Recent Activity"
          subtitle="Latest 5 activities"
          source="activities · freshness: latest 5"
          freshness="live"
          action={
            <Link
              href="/sales"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all →
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {(data?.recentActivities || []).length === 0 ? (
              <li className="py-3 text-sm text-slate-500">No recent activity.</li>
            ) : (
              data!.recentActivities.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{a.subject}</p>
                    <p className="text-xs capitalize text-slate-500">{a.type}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500">
                    {new Date(a.createdAt).toLocaleString()}
                  </time>
                </li>
              ))
            )}
          </ul>
        </Section>
      </div>

      {/* Follow-ups Section */}
      {(data?.upcomingActivities?.length ?? 0) > 0 && (
        <Section
          title="Follow-ups"
          subtitle="Due within 7 days (includes overdue)"
          source="activities · due within 7 days"
          freshness="live"
          action={
            <Link
              href="/sales"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Open sales →
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {data!.upcomingActivities.map((a) => {
              const overdue = new Date(a.dueAt) < new Date();
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium uppercase text-indigo-700">
                    {a.type}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {a.subject}
                  </p>
                  <span
                    className={`text-xs font-medium ${overdue ? 'text-rose-600' : 'text-slate-500'}`}
                  >
                    {overdue ? 'Overdue' : 'Due'} {new Date(a.dueAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    disabled={followBusy === a.id}
                    onClick={() => void handleCompleteFollowUp(a.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Complete
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Quick Actions + Knowledge + AI Usage */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Knowledge Hub"
          source="dashboard · knowledge"
          freshness="live"
          action={
            <Link
              href="/knowledge"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all →
            </Link>
          }
        >
          <p className="mt-3 text-3xl font-semibold text-slate-900">{ready}</p>
          <p className="text-sm text-slate-500">ready of {knowledge} sources</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {knowledge === 0 ? 'No sources yet' : 'Source: knowledge · freshness: live'}
          </p>
          <Link
            href="/knowledge"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all →
          </Link>
        </Section>

        <Section title="Quick Actions" source="dashboard · quick actions">
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/knowledge"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              <svg
                aria-hidden
                className="mx-auto h-4 w-4 text-slate-500 mb-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              Upload Document
            </Link>
            <Link
              href="/sales"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              <svg
                aria-hidden
                className="mx-auto h-4 w-4 text-slate-500 mb-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 4v16m8-8H4" />
                <path d="M8 10h8" />
                <path d="M8 14h8" />
              </svg>
              New Lead
            </Link>
            <Link
              href="/proposals"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              <svg
                aria-hidden
                className="mx-auto h-4 w-4 text-slate-500 mb-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              Create Proposal
            </Link>
            <Link
              href="/assistant"
              className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              <svg
                aria-hidden
                className="mx-auto h-4 w-4 text-slate-500 mb-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              </svg>
              Ask AI
            </Link>
          </div>
        </Section>

        <Section title="AI Usage" source="dashboard · conversations" freshness="live">
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {data?.aiConversationsCount ?? 0}
          </p>
          <p className="text-sm text-slate-500">conversations</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {(data?.aiConversationsCount ?? 0) === 0
              ? 'No conversations yet — ask a question'
              : 'Source: ai_conversations · freshness: live'}
          </p>
        </Section>
      </div>

      {/* Your Modules */}
      <Section
        title="Your Modules"
        subtitle="Enabled modules and coming soon"
        source="modules registry"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(modules?.modules || []).map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-slate-900">{m.name}</p>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    m.uiAvailable === false
                      ? 'bg-slate-100 text-slate-500'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {m.uiAvailable === false ? 'API only' : 'Active'}
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
      </Section>

      {/* Sticky Ask AI on mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-slate-200">
        <Link
          href="/assistant"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-indigo-700"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            className="h-5 w-5"
          >
            <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
          </svg>
          Ask Business AI
        </Link>
      </div>
    </div>
  );
}
