import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const webSrc = resolve(repo, 'apps/web/src');
const page = () =>
  readFileSync(resolve(webSrc, 'app/(workspace)/dashboard/page.tsx'), 'utf-8');
// Comments explain the rules; the assertions below must only judge real code.
const pageCode = () => page().replace(/^\s*\/\/.*$/gm, '');
const kpiCard = () => readFileSync(resolve(webSrc, 'components/dashboard/KPICard.tsx'), 'utf-8');
const apiRoutes = () =>
  readFileSync(resolve(repo, 'apps/api/src/modules/dashboard/routes.ts'), 'utf-8');

// Spec 7 acceptance. The dashboard used to open with decorative KPI trends and
// no notion of what needs a human, which is exactly what the spec rejects.
describe('dashboard is human-first (spec 7)', () => {
  it('never invents a KPI change when no endpoint measured one', () => {
    // The shared card is the real fix: it used to default to '+12%' / '-8%'.
    const card = kpiCard();
    expect(card).not.toMatch(/'\+12%'/);
    expect(card).not.toMatch(/'-8%'/);
    expect(card).toMatch(/\{trendValue && \(/);

    const src = page();
    for (const fabricated of ['+12%', '+8%', '+15%', '+2%', '-3%']) {
      expect(src).not.toContain(`trendValue: '${fabricated}'`);
    }
  });

  it('derives a trend from the daily series, and omits it with no baseline', () => {
    const src = page();
    expect(src).toMatch(/function measuredDelta\(/);
    expect(src).toMatch(/if \(previous <= 0\) return null;/);
    expect(src).toMatch(/measuredDelta\(trends\?\.daily, 'leads'\)/);
  });

  it('offers the main action only when a provider is actually connected', () => {
    const src = pageCode();
    expect(src).toMatch(/const aiReady = data\?\.aiConfigured === true;/);
    expect(src).toMatch(/href: '\/settings\/ai-providers', label: 'Connect an AI provider'/);
    // Header button and mobile sticky bar both follow the one decision.
    expect(src.match(/mainAction\.href/g)?.length).toBe(2);
    expect(src).toMatch(/aiReady \? '\/assistant' : '\/settings\/ai-providers'/);
  });

  it('derives onboarding from real records and never fakes a dismissal', () => {
    const src = pageCode();
    expect(src).toMatch(/const onboarding = \[/);
    expect(src).toMatch(/data\?\.aiConfigured === true/);
    expect(src).toMatch(/done: knowledge > 0/);
    expect(src).toMatch(/done: totalLeads > 0/);
    expect(src).toMatch(/\(data\?\.aiConversationsCount \?\? 0\) > 0/);
    // No real state contract exists, so the checklist must not be dismissible.
    expect(src).not.toMatch(/localStorage/);
    expect(src).not.toMatch(/dismiss/i);
  });

  it('shows what needs a human before showing metrics', () => {
    const src = page();
    expect(src).toMatch(/title="My attention"/);
    expect(src).toMatch(/attention\?\.runningOperations/);
    expect(src).toMatch(/attention\?\.failedOperations/);
    expect(src).toMatch(/attention\?\.awaitingReview/);
    // Attention is always rendered, with a real empty state.
    expect(src).toMatch(/Nothing is waiting on you/);

    const attentionAt = src.indexOf('title="My attention"');
    const kpisAt = src.indexOf('title="Key Metrics"');
    const insightsAt = src.indexOf('title="What changed"');
    const setupAt = src.indexOf('title="Get set up"');
    expect(setupAt).toBeGreaterThan(-1);
    expect(attentionAt).toBeGreaterThan(setupAt);
    expect(insightsAt).toBeGreaterThan(attentionAt);
    expect(kpisAt).toBeGreaterThan(insightsAt);
  });

  it('keeps every insight linked to the workflow it came from', () => {
    const src = page();
    expect(src).toMatch(/const insights = \[/);
    expect(src).toMatch(/href: '\/knowledge'/);
    expect(src).toMatch(/href: '\/sales'/);
    expect(src).toMatch(/href: '\/lead-intelligence'/);
    expect(src).toMatch(/Nothing to report yet/);
  });

  it('backs the new sections with real tenant-scoped counts, not client guesses', () => {
    const src = apiRoutes();
    expect(src).toMatch(/aiConfigured: providerStats\.count > 0/);
    expect(src).toMatch(/attention: \{/);
    expect(src).toMatch(/runningOperations: runningJobs\.count/);
    expect(src).toMatch(/failedOperations: failedJobs\.count/);
    expect(src).toMatch(/awaitingReview: reviewLeads\.count/);
    // Every added query is scoped to the organization, like the existing ones.
    for (const table of ['aiProviders', 'researchJobs', 'leadCandidates']) {
      expect(src).toMatch(new RegExp(`from\\(${table}\\)[\\s\\S]{0,400}organizationId`));
    }
  });
});
