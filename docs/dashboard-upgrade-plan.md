# Dashboard Upgrade Plan — Mobile & Desktop Optimized

**Date:** 2026-09-25  
**Scope:** Complete redesign of `/dashboard` page with charts, responsive design, and premium UX  
**Methodology:** Ponytail (minimal) + UI/UX Pro Max + Lazyweb references  
**References:** Mixpanel, Shopify, Polar.sh, Geckoboard, SaasOptics, Linktree mobile, TikTok Studio mobile

---

## Current Dashboard Audit

### What Works
- Real data from `/api/v1/dashboard` + `/api/v1/modules`
- Greeting + Ask Business AI CTA
- 4 KPI cards with source attribution
- Sales Pipeline (stage breakdown with values)
- Recent Activity + Follow-ups (due/overdue)
- Knowledge Hub + AI Usage cards
- Quick Actions grid
- Modules grid (active + coming soon)
- Loading/error states

### Gaps (vs Lazyweb Best Practices)
| Area | Current | Target |
|------|---------|--------|
| **Charts** | None (only static cards) | Revenue trend, pipeline funnel, activity timeline, conversion funnel |
| **Mobile** | Stacks at `sm:` but no touch optimization | Touch-friendly, swipeable charts, bottom sheet for details |
| **Visual Hierarchy** | Flat card grid | Clear sections with visual weight, progressive disclosure |
| **Empty States** | Basic text | Guiding illustrations + primary actions |
| **Time Range** | Fixed "just now" | Selectable (7d/30d/90d/custom) with comparison |
| **Data Freshness** | Text only | Live indicator + manual refresh with loading |
| **Interactivity** | Links only | Drill-down, hover tooltips, clickable chart segments |
| **Accessibility** | Basic labels | Full ARIA, keyboard nav, screen reader announcements |

---

## Design Direction (from Lazyweb References)

### Desktop (Mixpanel, Shopify, Polar.sh, Geckoboard)
- **Layout:** 12-col grid, sidebar-aware (max-w-6xl centered)
- **KPI Row:** 4 cards with trend indicators (↑↓%)
- **Charts Row:** 2-3 charts (trend + funnel + distribution)
- **Detail Sections:** Collapsible, source-attributed
- **Colors:** Indigo primary, semantic (emerald/rose/amber) for status

### Mobile (Linktree, TikTok Studio, Asana)
- **KPI Cards:** 2-col grid, swipeable horizontal scroll for >4
- **Charts:** Full-width, touch-pan zoom, simplified legends
- **Sections:** Accordion/collapsible to save vertical space
- **Bottom Actions:** Sticky primary CTA (Ask Business AI)
- **Tabs:** Segmented control for time range (7d/30d/90d)

### Chart Types to Implement
| Chart | Data Source | Purpose |
|-------|-------------|---------|
| **Revenue Trend** (line/area) | `/analytics/sales` daily | MRR/ARR trajectory |
| **Pipeline Funnel** (bar) | `/dashboard` pipeline stages | Conversion visualization |
| **Activity Timeline** (bar/line) | `/dashboard` recentActivities | Volume over time |
| **Conversion Funnel** (funnel) | Pipeline stages | Stage-to-stage conversion |
| **Knowledge Growth** (area) | `/analytics/knowledge` | Sources/chunks over time |

---

## Implementation Plan

### Phase 1: Foundation & Data Layer
1. **Extend Dashboard API** (`apps/api/src/modules/dashboard/routes.ts`)
   - Add `/dashboard/trends?range=7d|30d|90d` — daily metrics for charts
   - Add `/dashboard/funnel` — stage conversion rates
   - Add time-range parameter to existing endpoints

2. **Add Chart Library** (Ponytail: use existing deps first)
   - Check if `recharts` or `chart.js` already in `package.json`
   - If not, add `recharts` (tree-shakable, React-native, accessible)

### Phase 2: Core UI Components
3. **Create Reusable Chart Components** (`apps/web/src/components/charts/`)
   - `LineChart`, `AreaChart`, `BarChart`, `FunnelChart`, `DonutChart`
   - All with: responsive container, tooltip, legend, loading skeleton, error state
   - Props: `data`, `xKey`, `yKeys`, `colors`, `height`, `showGrid`, `animate`

4. **Create KPI Card Component** (`apps/web/src/components/dashboard/KPICard.tsx`)
   - Props: `label`, `value`, `trend?`, `trendValue?`, `source`, `icon?`, `loading`, `empty`
   - Trend: `up` (emerald), `down` (rose), `neutral` (slate)
   - Mobile: horizontal scroll container for >4 cards

5. **Create Section Wrapper** (`apps/web/src/components/dashboard/Section.tsx`)
   - Props: `title`, `subtitle`, `source`, `action?`, `collapsible?`, `defaultOpen?`, `children`
   - Mobile: accordion with chevron, desktop: always open

### Phase 3: Dashboard Page Redesign
6. **New Dashboard Layout Structure**
   ```
   Header (greeting + time-range selector + Ask AI CTA)
   
   KPI Row (4 cards, horizontal scroll on mobile)
   
   Charts Row 1: Revenue Trend (full width lg, 1/2 mobile)
                Pipeline Funnel (1/2 lg, full mobile)
   
   Charts Row 2: Activity Timeline (full width)
                Conversion Funnel (1/2) + Knowledge Growth (1/2)
   
   Detail Sections (collapsible on mobile):
   - Sales Pipeline (table + mini sparklines)
   - Recent Activity (list with avatars)
   - Follow-ups (with inline complete)
   - Quick Actions (icon grid)
   
   Modules Grid (unchanged but polished)
   ```

7. **Time Range Selector** (segmented control)
   - Options: 7d, 30d, 90d, Custom
   - Persists in `localStorage`
   - Triggers data refetch

8. **Live Indicator + Refresh**
   - Pulse animation when fresh (<30s)
   - Manual refresh with loading state
   - Auto-refresh toggle (off by default)

### Phase 4: Mobile Optimizations
9. **Touch Interactions**
   - Chart pan/zoom (recharts `PanZoom`)
   - Swipeable KPI cards (`snap-x` scroll)
   - Pull-to-refresh (native browser)

10. **Responsive Breakpoints**
    - `<640px`: 1-col charts, 2-col KPIs, accordion sections
    - `640-1024px`: 2-col charts, 4-col KPIs
    - `>1024px`: 3-4 col charts, 4-col KPIs

11. **Sticky Elements**
    - Header (greeting + time range) sticky on scroll
    - Ask AI CTA sticky bottom on mobile

### Phase 5: Accessibility & Polish
12. **ARIA & Keyboard**
    - Chart `role="img"` + `aria-label` with summary
    - Keyboard navigation between chart data points
    - Focus visible on all interactive elements

13. **Empty/Loading/Error States**
    - Chart skeletons (shimmer)
    - Empty state illustrations + primary action
    - Error boundary per chart section

14. **Animations** (Ponytail: minimal)
    - KPI count-up on mount (CSS counter)
    - Chart entrance (recharts animation)
    - Section expand/collapse (CSS transition)

---

## API Changes Required

### Dashboard Routes (`apps/api/src/modules/dashboard/routes.ts`)
```typescript
// NEW: GET /dashboard/trends?range=7d|30d|90d
// Returns: { daily: [{ date, leads, won, value, activities, knowledge, aiChats }] }

// NEW: GET /dashboard/funnel
// Returns: { stages: [{ stage, count, value, conversionRate, avgDays }] }

// EXTENDED: GET /dashboard?range=7d|30d|90d
// Filters recentActivities/upcomingActivities by range
```

### Analytics Routes (reuse existing)
- `/analytics/sales` — add `?range=` for daily breakdown
- `/analytics/knowledge` — add `?range=` for daily breakdown

---

## Files to Create/Modify

### New Files
```
apps/web/src/components/charts/
  LineChart.tsx
  AreaChart.tsx
  BarChart.tsx
  FunnelChart.tsx
  ChartTooltip.tsx
  ChartSkeleton.tsx

apps/web/src/components/dashboard/
  KPICard.tsx
  Section.tsx
  TimeRangeSelector.tsx
  LiveIndicator.tsx

apps/api/src/modules/dashboard/
  (extend routes.ts)
```

### Modified Files
```
apps/web/src/app/(workspace)/dashboard/page.tsx (complete rewrite)
apps/api/src/modules/dashboard/routes.ts (add trends + funnel)
apps/web/src/lib/api.ts (add trends/funnel calls)
tests/integration/dashboard.test.ts (new tests)
tests/integration/foundation.test.ts (add dashboard UI contracts)
```

---

## Acceptance Criteria

### Desktop
- [ ] 4 KPI cards with trend indicators load in <200ms
- [ ] Revenue trend chart (line/area) renders with tooltip on hover
- [ ] Pipeline funnel chart shows stage conversion rates
- [ ] Activity timeline shows volume over selected range
- [ ] All sections collapsible, source-attributed, freshness shown
- [ ] Time range selector (7d/30d/90d) refetches data
- [ ] Ask Business AI CTA prominent, sticky on scroll
- [ ] Modules grid updated with new `automation` + `billing`

### Mobile (<640px)
- [ ] KPI cards horizontal scroll (`snap-x`, 2 visible)
- [ ] Charts full-width, touch-pan zoom works
- [ ] Sections accordion (collapsed by default)
- [ ] Ask AI CTA sticky bottom
- [ ] Pull-to-refresh works
- [ ] No horizontal overflow

### Accessibility
- [ ] All charts have `aria-label` with text summary
- [ ] Keyboard navigable (tab through KPIs, charts, actions)
- [ ] Focus visible on all interactive elements
- [ ] Screen reader announces live region updates
- [ ] Color-blind safe palette (tested)

### Performance
- [ ] Initial paint <1.5s (Lighthouse)
- [ ] Chart data <50KB gzipped
- [ ] No layout shift (CLS <0.1)

### Tests
- [ ] Unit: KPICard trend logic, TimeRangeSelector persistence
- [ ] Integration: dashboard loads, charts render, time range works
- [ ] Visual: chart snapshots (if Percy/Chromatic)
- [ ] A11y: axe-core in CI (future)

---

## Dependencies Check

### Current Package.json (check first)
```bash
cat apps/web/package.json | grep -E "recharts|chart.js|d3|victory"
```

### If Adding Recharts
```bash
# From workspace root
cd apps/web && npm install recharts
# Types included
```

---

## Rollout Strategy

1. **Feature flag** (env var `DASHBOARD_V2`) — deploy behind flag
2. **Canary** — 10% users, monitor errors/performance
3. **Full rollout** — remove flag, delete old code
4. **Monitor** — Sentry for chart errors, Lighthouse CI for perf

---

## Next Steps After Dashboard

Once dashboard is complete, apply same pattern to:
1. **Analytics** (`/analytics`) — already has Diffy, add charts
2. **Sales** (`/sales`) — pipeline board, conversion charts
3. **Knowledge** (`/knowledge`) — ingestion charts, usage
4. **Intelligence** (`/intelligence`) — event volume, classification
5. **Settings** — usage charts per module

Each page gets: KPI row → Charts row → Detail sections → Mobile accordion

---

## Skill Usage Log

| Skill | Purpose |
|-------|---------|
| **Ponytail** | Minimal components, no chart lib if not needed, stdlib first |
| **UI/UX Pro Max** | Layout, colors, accessibility, mobile patterns, chart UX |
| **Lazyweb** | Dashboard references (Mixpanel, Shopify, etc.) |
| **Animate** | Chart entrance, KPI count-up, section expand |
| **Design System** | Token usage, component specs |
| **Design Taste** | Anti-generic styling, premium feel |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Chart lib bundle size | Tree-shake recharts, lazy-load chart components |
| Mobile chart performance | Simplify data points (<100), use canvas fallback |
| API latency | Cache trends (30s), parallel fetches |
| Breaking existing tests | Update foundation.test.ts contracts first |
| Scope creep | Strict acceptance criteria, no "nice to have" in v1 |