'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
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
  /** Spec 7: the main action is only "Ask Business AI" when a provider is live. */
  aiConfigured?: boolean;
  attention?: {
    runningOperations: number;
    failedOperations: number;
    awaitingReview: number;
  };
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

/**
 * Spec 7: a KPI trend must be measured, not decorative. The daily series is
 * split in half so the change is real, and with no baseline to compare against
 * the trend is omitted instead of guessed.
 */
function measuredDelta(
  daily: TrendData['daily'] | undefined,
  key: 'leads' | 'won' | 'wonValue' | 'activities',
): { trend: 'up' | 'down' | 'neutral'; value: string } | null {
  if (!daily || daily.length < 4) return null;
  const half = Math.floor(daily.length / 2);
  const sum = (rows: TrendData['daily']) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const previous = sum(daily.slice(0, half));
  const current = sum(daily.slice(half));
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { trend: 'neutral', value: '0%' };
  return { trend: pct > 0 ? 'up' : 'down', value: `${pct > 0 ? '+' : ''}${pct}%` };
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

  const leadDelta = measuredDelta(trends?.daily, 'leads');
  const wonDelta = measuredDelta(trends?.daily, 'won');
  const wonValueDelta = measuredDelta(trends?.daily, 'wonValue');

  const kpis = [
    {
      label: 'Total Leads',
      value: formatNumber(totalLeads),
      trend: leadDelta?.trend ?? ('neutral' as const),
      trendValue: leadDelta?.value,
      source: 'dashboard · pipeline',
      icon: KPI_ICONS.leads,
    },
    {
      label: 'Won Deals',
      value: formatNumber(wonLeads),
      trend: wonDelta?.trend ?? ('neutral' as const),
      trendValue: wonDelta?.value,
      source: 'dashboard · stage=closed_won',
      icon: KPI_ICONS.won,
    },
    {
      label: 'Won Value',
      value: formatCurrency(totalWonValue),
      trend: wonValueDelta?.trend ?? ('neutral' as const),
      trendValue: wonValueDelta?.value,
      source: 'dashboard · sum(won value)',
      icon: KPI_ICONS.won,
    },
    {
      label: 'Conversion Rate',
      value: `${conversionRate}%`,
      trend: 'neutral' as const,
      // No endpoint stores a historical conversion rate, so no trend is claimed.
      trendValue: undefined,
      source: 'dashboard · won/total',
      icon: KPI_ICONS.leads,
    },
  ];

  // Spec 7 items 1-4, all derived from data this page already loaded.
  const attention = data?.attention;
  const overdueCount = (data?.upcomingActivities ?? []).filter(
    (a) => new Date(a.dueAt) < new Date(),
  ).length;
  const attentionItems = [
    {
      label: 'Follow-ups due or overdue',
      count: (data?.upcomingActivities ?? []).length,
      detail: overdueCount > 0 ? `${overdueCount} overdue` : 'All on time',
      href: '/sales',
    },
    {
      label: 'Operations running now',
      count: attention?.runningOperations ?? 0,
      detail: 'Research runs still working',
      href: '/lead-intelligence',
    },
    {
      label: 'Operations failed',
      count: attention?.failedOperations ?? 0,
      detail: 'Stopped safely, nothing half-written',
      href: '/lead-intelligence',
    },
    {
      label: 'Leads waiting for your review',
      count: attention?.awaitingReview ?? 0,
      detail: 'Scored, not yet approved or rejected',
      href: '/lead-intelligence',
    },
  ].filter((item) => item.count > 0);

  // First-use checklist. Spec 7 allows persisting/dismissing only through a real
  // state contract, and none exists, so every item is derived and none can be
  // dismissed. It disappears on its own once the work is genuinely done.
  const onboarding = [
    { label: 'Connect an AI provider', done: data?.aiConfigured === true, href: '/settings/ai-providers' },
    { label: 'Add your first knowledge source', done: knowledge > 0, href: '/knowledge' },
    { label: 'Add your first lead', done: totalLeads > 0, href: '/sales' },
    { label: 'Ask your first question', done: (data?.aiConversationsCount ?? 0) > 0, href: '/assistant' },
  ];
  const onboardingLeft = onboarding.filter((item) => !item.done).length;

  const insights = [
    knowledge > 0 && ready > 0
      ? {
          text: `${ready} of your ${knowledge} knowledge sources are indexed and ready to answer questions.`,
          href: '/knowledge',
        }
      : null,
    overdueCount > 0
      ? {
          text: `${overdueCount} follow-up${overdueCount === 1 ? ' is' : 's are'} overdue.`,
          href: '/sales',
        }
      : null,
    (attention?.awaitingReview ?? 0) > 0
      ? {
          text: `${attention?.awaitingReview} scored lead${attention?.awaitingReview === 1 ? '' : 's'} need your review before they count as qualified.`,
          href: '/lead-intelligence',
        }
      : null,
    (attention?.failedOperations ?? 0) > 0
      ? {
          text: `${attention?.failedOperations} research run${attention?.failedOperations === 1 ? '' : 's'} stopped. Nothing was half-written, so you can start again.`,
          href: '/lead-intelligence',
        }
      : null,
    wonLeads > 0
      ? {
          text: `${wonLeads} deal${wonLeads === 1 ? '' : 's'} closed in this window, worth ${formatCurrency(totalWonValue)}.`,
          href: '/sales',
        }
      : null,
  ].filter(Boolean) as { text: string; href: string }[];

  // Without a live provider, asking a question cannot work — so the main action
  // becomes the setup step that unblocks it.
  const aiReady = data?.aiConfigured === true;
  const mainAction = aiReady
    ? { href: '/assistant', label: 'Ask Business AI' }
    : { href: '/settings/ai-providers', label: 'Connect an AI provider' };
  const attentionTotal = attentionItems.reduce((total, item) => total + item.count, 0);

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
              isLive={autoRefresh}
              lastUpdated={lastRefresh ?? undefined}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              autoRefresh={autoRefresh}
              onAutoRefreshToggle={setAutoRefresh}
            />
            {/* Spec 7: the main action must match what is actually possible. */}
            <Link
              href={mainAction.href}
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
              {mainAction.label}
            </Link>
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              {attentionTotal > 0
                ? `${attentionTotal} item${attentionTotal === 1 ? '' : 's'} need you today.`
                : 'Nothing needs you right now.'}
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

      {/* Spec 7 order: context and main action, then first-use checklist, then
          what needs a human, then insights, then metrics, then quick actions. */}
      {onboardingLeft > 0 && (
        <Section
          title="Get set up"
          subtitle={`${onboardingLeft} step${onboardingLeft === 1 ? '' : 's'} left. Each one unlocks something real.`}
          source="dashboard · derived from live data"
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {onboarding.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm hover:bg-slate-50 ${
                    item.done
                      ? 'border-slate-200 text-slate-500'
                      : 'border-slate-200 text-slate-800'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    {item.done ? '✓' : ''}
                  </span>
                  <span className={item.done ? 'line-through' : ''}>{item.label}</span>
                  {item.done && <span className="sr-only">(done)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title="My attention"
        subtitle={
          attentionTotal > 0
            ? `${attentionTotal} item${attentionTotal === 1 ? '' : 's'} waiting on you`
            : 'Nothing is waiting on you'
        }
        source="dashboard · attention"
        action={
          <Link href="/sales" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            Open sales →
          </Link>
        }
      >
        {attentionItems.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">
            No due follow-ups, no running or failed operations, nothing waiting for review.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {attentionItems.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="block rounded-lg border border-slate-200 px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums">{item.count}</p>
                  <p className="text-xs font-medium text-slate-700">{item.label}</p>
                  <p className="text-[11px] text-slate-500">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Follow-ups Section */}
      {(data?.upcomingActivities?.length ?? 0) > 0 && (
        <Section
          title="Follow-ups to complete"
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

      <Section
        title="What changed"
        subtitle="Only what your own data shows. Each insight opens the place it came from."
        source="dashboard · derived from live data"
      >
        {insights.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">
            Nothing to report yet. Add a lead or a knowledge source and this fills in.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {insights.map((insight) => (
              <li key={insight.text} className="py-2.5">
                <Link href={insight.href} className="group flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700">{insight.text}</span>
                  <span className="shrink-0 text-xs font-medium text-indigo-600 group-hover:text-indigo-700">
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

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
              href={aiReady ? '/assistant' : '/settings/ai-providers'}
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
                <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              </svg>
              {aiReady ? 'Ask AI' : 'Connect AI'}
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

      {/* Sticky main action on mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-slate-200">
        <Link
          href={mainAction.href}
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
          {mainAction.label}
        </Link>
      </div>
    </div>
  );
}
