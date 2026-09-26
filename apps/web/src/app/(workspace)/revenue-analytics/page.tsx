'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/errors';
import { LineChart, AreaChart, BarChart } from '@/components/charts';
import { KPICard, Section, TimeRangeSelector, LiveIndicator } from '@/components/dashboard';

type RevenueMetrics = {
  metrics: {
    id: string;
    organizationId: string;
    date: string;
    mrr: number;
    arr: number;
    newMrr: number;
    expansionMrr: number;
    contractionMrr: number;
    churnedMrr: number;
    totalCustomers: number;
    newCustomers: number;
    churnedCustomers: number;
    arpu: number;
    ltv: number;
    cac: number;
    paybackPeriod: number;
    createdAt: string;
    updatedAt: string;
  }[];
  summary: {
    currentMrr: number;
    currentArr: number;
    totalNewMrr: number;
    totalExpansionMrr: number;
    totalContractionMrr: number;
    totalChurnedMrr: number;
    netNewMrr: number;
    avgArpu: number;
    totalCustomers: number;
  };
  range: { from: string; to: string; days: number };
};

type ForecastData = {
  forecast: {
    id: string;
    organizationId: string;
    forecastDate: string;
    periodStart: string;
    periodEnd: string;
    predictedMrr: number;
    predictedArr: number;
    confidenceLower: number | null;
    confidenceUpper: number | null;
    modelVersion: string;
    createdAt: string;
  }[];
};

type CohortData = {
  cohorts: {
    id: string;
    organizationId: string;
    cohortMonth: string;
    periodNumber: number;
    customersCount: number;
    retainedCount: number;
    revenueRetained: number;
    retentionRate: number;
    revenueRetentionRate: number;
    createdAt: string;
  }[];
};

type KPIData = {
  label: string;
  value: number;
  change: number;
  unit: string;
};

type ChurnData = {
  churnedMrr: number;
  contractionMrr: number;
  totalLostMrr: number;
  totalCustomersLost: number;
  churnRate: number;
  period: { from: string; to: string };
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function RevenueAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [cohorts, setCohorts] = useState<CohortData | null>(null);
  const [churn, setChurn] = useState<ChurnData | null>(null);
  const [kpis, setKpis] = useState<KPIData[]>([]);

  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, f, c, k, ch] = await Promise.all([
        api<RevenueMetrics>(`/api/v1/revenue-analytics/metrics?range=${timeRange}`),
        api<ForecastData>(`/api/v1/revenue-analytics/forecast`),
        api<CohortData>(`/api/v1/revenue-analytics/cohorts`),
        api<{ kpis: KPIData[] }>(`/api/v1/revenue-analytics/kpis`),
        api<ChurnData>(`/api/v1/revenue-analytics/churn-analysis?range=${timeRange}`),
      ]);
      setMetrics(m);
      setForecast(f);
      setCohorts(c);
      setKpis(k.kpis);
      setChurn(ch);
      setLastRefresh(new Date());
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setFlash(null);
    try {
      await loadAll();
      setFlash({ ok: true, text: 'Data refreshed' });
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  const handleTimeRangeChange = useCallback((range: '7d' | '30d' | '90d' | 'custom') => {
    setTimeRange(range);
  }, []);

  const handleCustomRangeChange = useCallback((range: { from: Date; to: Date }) => {
    setCustomRange(range);
    setTimeRange('custom');
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadAll, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadAll]);

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500"
      >
        Loading revenue analytics…
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
          onClick={() => void loadAll()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const summary = metrics?.summary || {
    currentMrr: 0,
    currentArr: 0,
    totalNewMrr: 0,
    totalExpansionMrr: 0,
    totalContractionMrr: 0,
    totalChurnedMrr: 0,
    netNewMrr: 0,
    avgArpu: 0,
    totalCustomers: 0,
  };

  const changeFor = (label: string) => {
    const kpi = kpis.find((k) => k.label === label);
    if (!kpi) return '—';
    return `${kpi.change > 0 ? '+' : ''}${kpi.change.toFixed(1)}%`;
  };

  const kpiCards = [
    {
      label: 'MRR',
      value: formatCurrency(summary.currentMrr),
      trend: 'up' as const,
      trendValue: changeFor('MRR'),
      source: 'revenue-analytics/metrics',
    },
    {
      label: 'ARR',
      value: formatCurrency(summary.currentArr),
      trend: 'up' as const,
      trendValue: changeFor('ARR'),
      source: 'revenue-analytics/metrics',
    },
    {
      label: 'Total Customers',
      value: formatNumber(summary.totalCustomers),
      trend: 'up' as const,
      trendValue: changeFor('Total Customers'),
      source: 'revenue-analytics/metrics',
    },
    {
      label: 'Net New MRR',
      value: formatCurrency(summary.netNewMrr),
      trend: summary.netNewMrr > 0 ? ('up' as const) : ('down' as const),
      trendValue: changeFor('Net New MRR'),
      source: 'revenue-analytics/metrics',
    },
    {
      label: 'ARPU',
      value: formatCurrency(summary.avgArpu),
      trend: 'neutral' as const,
      trendValue: '—',
      source: 'revenue-analytics/metrics',
    },
    {
      label: 'Churn Rate',
      value: churn ? `${churn.churnRate.toFixed(1)}%` : '—',
      trend:
        churn && churn.churnRate > 5
          ? ('down' as const)
          : churn && churn.churnRate < 2
            ? ('up' as const)
            : ('neutral' as const),
      trendValue: churn ? `${churn.churnRate.toFixed(1)}%` : '—',
      source: 'revenue-analytics/churn-analysis',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with time range and live indicator */}
      <Section
        className="border-none bg-transparent p-0"
        title="Revenue Analytics"
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
          </div>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Revenue Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track MRR, ARR, churn, cohorts, and revenue forecasts.
            </p>
          </div>
        </div>
      </Section>

      {flash && (
        <div
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-4 py-3 text-sm ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {flash.text}
        </div>
      )}

      {/* KPI Row */}
      <Section
        className="border-none bg-transparent p-0"
        title="Key Metrics"
        subtitle={
          timeRange === 'custom'
            ? `Custom range (${customRange.from.toLocaleDateString()} – ${customRange.to.toLocaleDateString()})`
            : `Last ${timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days'}`
        }
        source="revenue-analytics/metrics"
        freshness="live"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((kpi) => (
            <KPICard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              trend={kpi.trend}
              trendValue={kpi.trendValue}
              source={kpi.source}
            />
          ))}
        </div>
      </Section>

      {/* Charts Row 1: MRR Trend + ARR Trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="MRR Trend"
          subtitle="Monthly Recurring Revenue over time"
          source="revenue-analytics/metrics"
          freshness="live"
          collapsible={false}
        >
          {metrics && (
            <AreaChart
              data={metrics.metrics}
              xKey="date"
              yKeys={[
                { key: 'mrr', label: 'MRR', color: '#10b981', fillOpacity: 0.2 },
                { key: 'arr', label: 'ARR', color: '#3b82f6', fillOpacity: 0.15 },
              ]}
              height={300}
              empty={!metrics.metrics.length}
              tooltipFormatter={(value) => [formatCurrency(value), 'Revenue']}
            />
          )}
        </Section>

        <Section
          title="Revenue Components"
          subtitle="New, Expansion, Contraction, Churn MRR"
          source="revenue-analytics/metrics"
          freshness="live"
          collapsible={false}
        >
          {metrics && (
            <AreaChart
              data={metrics.metrics}
              xKey="date"
              yKeys={[
                { key: 'newMrr', label: 'New MRR', color: '#10b981', fillOpacity: 0.2 },
                { key: 'expansionMrr', label: 'Expansion', color: '#3b82f6', fillOpacity: 0.15 },
                {
                  key: 'contractionMrr',
                  label: 'Contraction',
                  color: '#f59e0b',
                  fillOpacity: 0.15,
                },
                { key: 'churnedMrr', label: 'Churn', color: '#ef4444', fillOpacity: 0.15 },
              ]}
              height={300}
              stacked={true}
              empty={!metrics.metrics.length}
              tooltipFormatter={(value, name) => [formatCurrency(value), name]}
            />
          )}
        </Section>
      </div>

      {/* Charts Row 2: Customer Growth + Churn Analysis */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Customer Growth"
          subtitle="Total, New, and Churned Customers"
          source="revenue-analytics/metrics"
          freshness="live"
          collapsible={false}
        >
          {metrics && (
            <LineChart
              data={metrics.metrics}
              xKey="date"
              yKeys={[
                { key: 'totalCustomers', label: 'Total Customers', color: '#3b82f6' },
                { key: 'newCustomers', label: 'New', color: '#10b981' },
                { key: 'churnedCustomers', label: 'Churned', color: '#ef4444' },
              ]}
              height={300}
              empty={!metrics.metrics.length}
              tooltipFormatter={(value, name) => [formatNumber(value), name]}
            />
          )}
        </Section>

        <Section
          title="Churn Analysis"
          subtitle="Revenue and customer churn breakdown"
          source="revenue-analytics/churn-analysis"
          freshness="live"
          collapsible={false}
        >
          {churn && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Churned MRR</p>
                  <p className="mt-1 text-2xl font-semibold text-rose-600">
                    {formatCurrency(churn.churnedMrr)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Contraction MRR</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600">
                    {formatCurrency(churn.contractionMrr)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Total Lost MRR</p>
                  <p className="mt-1 text-2xl font-semibold text-red-600">
                    {formatCurrency(churn.totalLostMrr)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Customers Lost</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatNumber(churn.totalCustomersLost)}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Churn Rate</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">
                  {churn.churnRate.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Period: {formatDate(churn.period.from)} – {formatDate(churn.period.to)}
                </p>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Charts Row 3: Forecast + Cohort Retention */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Revenue Forecast"
          subtitle="Predicted MRR/ARR for upcoming periods"
          source="revenue-analytics/forecast"
          freshness="live"
          collapsible={false}
        >
          {forecast && forecast.forecast.length > 0 ? (
            <LineChart
              data={forecast.forecast.map((r) => ({
                forecastDate: r.forecastDate,
                predictedMrr: r.predictedMrr,
                predictedArr: r.predictedArr,
              }))}
              xKey="forecastDate"
              yKeys={[
                { key: 'predictedMrr', label: 'Predicted MRR', color: '#10b981' },
                { key: 'predictedArr', label: 'Predicted ARR', color: '#3b82f6' },
              ]}
              height={300}
              empty={!forecast.forecast.length}
              tooltipFormatter={(value) => [formatCurrency(value), 'Forecast']}
            />
          ) : (
            <div
              className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center"
              style={{ height: 300 }}
            >
              <svg
                aria-hidden
                className="mx-auto h-12 w-12 text-slate-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 3v18h18" />
                <path d="M7 14l4-4 4 4 5-6" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-600">No forecast data</p>
              <p className="mt-1 text-sm text-slate-500">
                Forecast data will appear when available
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Cohort Retention"
          subtitle="Customer retention by cohort month"
          source="revenue-analytics/cohorts"
          freshness="live"
          collapsible={false}
        >
          {cohorts && cohorts.cohorts.length > 0 ? (
            <BarChart
              data={cohorts.cohorts}
              xKey="cohortMonth"
              yKeys={[
                { key: 'retentionRate', label: 'Retention Rate (%)', color: '#10b981' },
                { key: 'revenueRetentionRate', label: 'Revenue Retention (%)', color: '#3b82f6' },
              ]}
              height={300}
              horizontal={true}
              empty={!cohorts.cohorts.length}
              maxBarSize={30}
              tooltipFormatter={(value, name) => [`${value}%`, name]}
            />
          ) : (
            <div
              className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center"
              style={{ height: 300 }}
            >
              <svg
                aria-hidden
                className="mx-auto h-12 w-12 text-slate-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 4 4 5-6" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-600">No cohort data</p>
              <p className="mt-1 text-sm text-slate-500">
                Cohort analysis requires historical data
              </p>
            </div>
          )}
        </Section>
      </div>

      {/* Detailed Metrics Table */}
      <Section
        title="Detailed Metrics"
        subtitle="Daily revenue metrics breakdown"
        source="revenue-analytics/metrics"
        freshness="live"
        action={
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
          >
            Export CSV
          </button>
        }
      >
        {metrics && metrics.metrics.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">MRR</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">ARR</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">New MRR</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Expansion</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Contraction</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Churn</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Customers</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">ARPU</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">LTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {metrics.metrics
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 30)
                  .map((m) => (
                    <tr key={m.date} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{formatDate(m.date)}</td>
                      <td className="text-right px-4 py-3 text-slate-900 font-medium">
                        {formatCurrency(m.mrr)}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-900">
                        {formatCurrency(m.arr)}
                      </td>
                      <td className="text-right px-4 py-3 text-emerald-600">
                        {formatCurrency(m.newMrr)}
                      </td>
                      <td className="text-right px-4 py-3 text-blue-600">
                        {formatCurrency(m.expansionMrr)}
                      </td>
                      <td className="text-right px-4 py-3 text-amber-600">
                        {formatCurrency(m.contractionMrr)}
                      </td>
                      <td className="text-right px-4 py-3 text-red-600">
                        {formatCurrency(m.churnedMrr)}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-900">
                        {formatNumber(m.totalCustomers)}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-900">
                        {formatCurrency(m.arpu)}
                      </td>
                      <td className="text-right px-4 py-3 text-slate-900">
                        {formatCurrency(m.ltv)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-8">
            No metrics data available for this period
          </p>
        )}
      </Section>
    </div>
  );
}
