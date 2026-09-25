import { Hono } from 'hono';
import { getTenant } from '../../core/tenancy/context.js';
import { requirePermission } from '../../core/tenancy/context.js';
import { getDb } from '../../db/index.js';
import { revenueMetrics, revenueForecast, cohortRetention } from '../../db/schema.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';

const revenueAnalytics = new Hono();

function parseRange(range?: string) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  let days = 30;
  switch (range) {
    case '7d':
      days = 7;
      break;
    case '30d':
      days = 30;
      break;
    case '90d':
      days = 90;
      break;
    default:
      days = 30;
  }
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  from.setHours(0, 0, 0, 0);
  return { from, to, days };
}

function toDateString(d: Date) {
  return d.toISOString().split('T')[0];
}

revenueAnalytics.get('/metrics', requirePermission('revenue-analytics.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const range = c.req.query('range') || '30d';
  const { from, to, days } = parseRange(range);
  const fromStr = toDateString(from);
  const toStr = toDateString(to);

  const metrics = await db
    .select()
    .from(revenueMetrics)
    .where(
      and(
        eq(revenueMetrics.organizationId, tenant.organizationId),
        gte(revenueMetrics.date, fromStr),
        lte(revenueMetrics.date, toStr),
      ),
    )
    .orderBy(revenueMetrics.date);

  // Fill missing dates with zeros
  const metricsMap = new Map(metrics.map((m) => [m.date, m]));
  const filledMetrics = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const key = toDateString(d);
    filledMetrics.push(
      metricsMap.get(key) || {
        id: 'placeholder',
        organizationId: tenant.organizationId,
        date: key,
        mrr: 0,
        arr: 0,
        newMrr: 0,
        expansionMrr: 0,
        contractionMrr: 0,
        churnedMrr: 0,
        totalCustomers: 0,
        newCustomers: 0,
        churnedCustomers: 0,
        arpu: 0,
        ltv: 0,
        cac: 0,
        paybackPeriod: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
  }

  // Calculate summary
  const summary = {
    currentMrr: filledMetrics[filledMetrics.length - 1]?.mrr || 0,
    currentArr: filledMetrics[filledMetrics.length - 1]?.arr || 0,
    totalNewMrr: filledMetrics.reduce((s, m) => s + m.newMrr, 0),
    totalExpansionMrr: filledMetrics.reduce((s, m) => s + m.expansionMrr, 0),
    totalContractionMrr: filledMetrics.reduce((s, m) => s + m.contractionMrr, 0),
    totalChurnedMrr: filledMetrics.reduce((s, m) => s + m.churnedMrr, 0),
    netNewMrr: filledMetrics.reduce(
      (s, m) => s + m.newMrr + m.expansionMrr - m.contractionMrr - m.churnedMrr,
      0,
    ),
    avgArpu:
      filledMetrics.length > 0
        ? Math.round(filledMetrics.reduce((s, m) => s + m.arpu, 0) / filledMetrics.length)
        : 0,
    totalCustomers: filledMetrics[filledMetrics.length - 1]?.totalCustomers || 0,
  };

  return c.json({ metrics: filledMetrics, summary, range: { from: fromStr, to: toStr, days } });
});

revenueAnalytics.get('/forecast', requirePermission('revenue-analytics.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const limit = parseInt(c.req.query('limit') || '12');

  const forecast = await db
    .select()
    .from(revenueForecast)
    .where(eq(revenueForecast.organizationId, tenant.organizationId))
    .orderBy(revenueForecast.forecastDate)
    .limit(limit);

  return c.json({ forecast });
});

revenueAnalytics.get('/cohorts', requirePermission('revenue-analytics.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const limit = parseInt(c.req.query('limit') || '12');

  const cohorts = await db
    .select()
    .from(cohortRetention)
    .where(eq(cohortRetention.organizationId, tenant.organizationId))
    .orderBy(desc(cohortRetention.cohortMonth))
    .limit(limit);

  // Group by cohort month and calculate retention rates
  const grouped = cohorts.map((c) => ({
    ...c,
    retentionRate:
      c.customersCount > 0 ? Math.round((c.retainedCount / c.customersCount) * 100) : 0,
    revenueRetentionRate:
      c.customersCount > 0 ? Math.round((c.revenueRetained / (c.customersCount * 100)) * 100) : 0,
  }));

  return c.json({ cohorts: grouped });
});

revenueAnalytics.get('/kpis', requirePermission('revenue-analytics.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();

  // Get latest metrics
  const [latestMetric] = await db
    .select()
    .from(revenueMetrics)
    .where(eq(revenueMetrics.organizationId, tenant.organizationId))
    .orderBy(desc(revenueMetrics.date))
    .limit(1);

  // Get previous period for comparison
  const [prevMetric] = await db
    .select()
    .from(revenueMetrics)
    .where(
      and(
        eq(revenueMetrics.organizationId, tenant.organizationId),
        sql`${revenueMetrics.date} < (SELECT MAX(date) FROM ${revenueMetrics})`,
      ),
    )
    .orderBy(desc(revenueMetrics.date))
    .limit(1);

  const mrr = latestMetric?.mrr || 0;
  const prevMrr = prevMetric?.mrr || 0;
  const mrrChange = prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0;

  const arr = latestMetric?.arr || 0;
  const prevArr = prevMetric?.arr || 0;
  const arrChange = prevArr > 0 ? ((arr - prevArr) / prevArr) * 100 : 0;

  const customers = latestMetric?.totalCustomers || 0;
  const prevCustomers = prevMetric?.totalCustomers || 0;
  const customerChange =
    prevCustomers > 0 ? ((customers - prevCustomers) / prevCustomers) * 100 : 0;

  return c.json({
    kpis: [
      { label: 'MRR', value: mrr, change: mrrChange, unit: '$' },
      { label: 'ARR', value: arr, change: arrChange, unit: '$' },
      { label: 'Total Customers', value: customers, change: customerChange, unit: '' },
      { label: 'ARPU', value: latestMetric?.arpu || 0, change: 0, unit: '$' },
      { label: 'LTV', value: latestMetric?.ltv || 0, change: 0, unit: '$' },
      { label: 'CAC', value: latestMetric?.cac || 0, change: 0, unit: '$' },
      { label: 'Payback Period', value: latestMetric?.paybackPeriod || 0, change: 0, unit: 'mo' },
      {
        label: 'Net New MRR',
        value:
          (latestMetric?.newMrr || 0) +
          (latestMetric?.expansionMrr || 0) -
          (latestMetric?.contractionMrr || 0) -
          (latestMetric?.churnedMrr || 0),
        change: 0,
        unit: '$',
      },
    ],
  });
});

revenueAnalytics.get('/churn-analysis', requirePermission('revenue-analytics.read'), async (c) => {
  const tenant = getTenant(c);
  const db = getDb();
  const range = c.req.query('range') || '30d';
  const { from, to } = parseRange(range);
  const fromStr = toDateString(from);
  const toStr = toDateString(to);

  const metrics = await db
    .select()
    .from(revenueMetrics)
    .where(
      and(
        eq(revenueMetrics.organizationId, tenant.organizationId),
        gte(revenueMetrics.date, fromStr),
        lte(revenueMetrics.date, toStr),
      ),
    )
    .orderBy(revenueMetrics.date);

  const churnedMrr = metrics.reduce((s, m) => s + m.churnedMrr, 0);
  const contractionMrr = metrics.reduce((s, m) => s + m.contractionMrr, 0);
  const totalLostMrr = churnedMrr + contractionMrr;
  const totalCustomersLost = metrics.reduce((s, m) => s + m.churnedCustomers, 0);

  // Churn rate calculation
  const avgCustomers =
    metrics.length > 0 ? metrics.reduce((s, m) => s + m.totalCustomers, 0) / metrics.length : 0;
  const churnRate =
    avgCustomers > 0 ? (totalCustomersLost / metrics.length / avgCustomers) * 100 : 0;

  return c.json({
    churnedMrr,
    contractionMrr,
    totalLostMrr,
    totalCustomersLost,
    churnRate: Math.round(churnRate * 100) / 100,
    period: { from: fromStr, to: toStr },
  });
});

export default revenueAnalytics;
