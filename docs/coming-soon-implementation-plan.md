# Coming Soon Modules — Implementation Plan

**Date:** 2026-09-25  
**Scope:** 8 modules marked `comingSoon: true` + `uiAvailable: false` in module registry  
**Excluded:** `mobile` (iOS/Android apps) — user directive to skip  
**Methodology:** Ponytail (full) + UI/UX Pro Max — minimal, functional, pattern-consistent

---

## Module Overview

| # | Module ID | Name | Description | Priority |
|---|-----------|------|-------------|----------|
| 1 | `automation` | Automation | CRM automation sequences | High |
| 2 | `agent-marketplace` | Agent Marketplace | AI agent marketplace | High |
| 3 | `revenue-analytics` | Revenue Analytics | Advanced revenue analytics | Medium |
| 4 | `accounting` | Accounting | Native accounting integration | Medium |
| 5 | `workflow-builder` | Workflow Builder | Custom workflow builder | Medium |
| 6 | `white-label` | White Labeling | White-label customization | Low — **built 2026-09-25, option (B) chosen** |
| 7 | `billing` | Billing | Subscription & billing management | High |
| 8 | `api-marketplace` | API Marketplace | Public API marketplace | Low |

---

## Existing Patterns to Reuse (Ponytail: "Already in this codebase?")

### API Patterns (from `apps/api/src/modules/*/routes.ts`)
- Hono router with `authMiddleware` + `tenantMiddleware`
- Zod validation for all inputs
- `requirePermission()` for role gates (owner/admin/analyst/member)
- Audit logging via `audit()` helper
- Tenant-scoped queries: `.where(eq(table.organizationId, tenant.organizationId))`
- Consistent error responses: `ValidationError` (422), `NotFound` (404), `Forbidden` (403)

### UI Patterns (from `apps/web/src/app/(workspace)/*/page.tsx`)
- `'use client'` + `api` from `@/lib/api`
- Loading state: `role="status"` spinner
- Error state: `role="alert"` with Retry button
- Empty state: dashed border card with guiding copy + action hint
- Flash messages: `role="status"` (success) / `role="alert"` (error)
- Busy states on buttons: `disabled={busy}` + loading text
- Cards: `rounded-xl border border-slate-200 bg-white p-4`
- Grid layouts: `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3`
- Form labels: `label htmlFor` + `span aria-hidden>*`
- Confirm destructive actions: `window.confirm()`

### Navigation (from `layout.tsx`)
- NAV array with `{ href, label, moduleId }`
- ICONS record with SVG path strings
- `uiAvailable` from `/modules` response controls "Soon" badge
- `comingSoon` from `/modules` response populates sidebar list

### Database
- Drizzle ORM with `pgTable`
- Migrations in `apps/api/drizzle/`
- Tenant isolation via `organizationId` on all tables

---

## Per-Module Implementation Plan

### 1. Automation (CRM Automation Sequences)

**Backend (`apps/api/src/modules/automation/routes.ts`)**
- Tables: `automation_workflows`, `automation_steps`, `automation_runs`
- Workflow: trigger (lead_created, stage_changed, activity_due, schedule), conditions, actions (create_task, send_email, update_field, notify)
- CRUD: list, get, create, update, delete, toggle enabled
- Execute: manual trigger + scheduled (worker later)
- Permissions: owner/admin/analyst manage; member read

**UI (`apps/web/src/app/(workspace)/automation/page.tsx`)**
- List view: workflow cards with trigger badge, enabled toggle, last run, next run
- Create/edit modal: trigger select → conditions builder → actions builder
- Run history: table with status, started/finished, result summary
- Empty: "No automations yet — create your first sequence"
- Icon: `M9 12l2 2 4-4` (play) + `M12 2v20M2 12h20` (timer)

**API Endpoints:**
```
GET    /automation/workflows
POST   /automation/workflows
GET    /automation/workflows/:id
PATCH  /automation/workflows/:id
DELETE /automation/workflows/:id
POST   /automation/workflows/:id/run
GET    /automation/workflows/:id/runs
```

---

### 2. Agent Marketplace (AI Agent Marketplace)

**Backend (`apps/api/src/modules/agent-marketplace/routes.ts`)**
- Tables: `marketplace_agents`, `marketplace_installations`, `marketplace_reviews`
- Agent: name, description, category, capabilities[], config_schema, pricing (free/paid), publisher_id, version, status
- Installation: org_id, agent_id, config, installed_by, status
- Browse: list with filters (category, capability, pricing), search
- Install/Uninstall: owner/admin only
- Reviews: rating + comment (installed users only)

**UI (`apps/web/src/app/(workspace)/agent-marketplace/page.tsx`)**
- Browse grid: agent cards with icon, category badge, pricing, rating, install button
- Agent detail: description, capabilities, config preview, reviews
- Installed tab: list with status, configure, uninstall
- Empty: "Discover AI agents — browse by category"
- Icon: `M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z` (robot-ish)

**API Endpoints:**
```
GET    /marketplace/agents?category=&capability=&pricing=&q=
GET    /marketplace/agents/:id
POST   /marketplace/agents/:id/install
DELETE /marketplace/installations/:id
GET    /marketplace/installations
GET    /marketplace/agents/:id/reviews
POST   /marketplace/agents/:id/reviews
```

---

### 3. Revenue Analytics (Advanced Revenue Analytics)

**Backend (`apps/api/src/modules/revenue-analytics/routes.ts`)**
- Extends existing `analytics` module — no new tables needed
- Computed endpoints using existing `leads`, `activities`, `proposals` data
- Metrics: MRR/ARR, pipeline velocity, cohort retention, LTV, churn risk, forecast
- Time-range params: `?from=&to=&interval=month|quarter`
- Permissions: owner/admin/analyst read

**UI (`apps/web/src/app/(workspace)/revenue-analytics/page.tsx`)**
- Dashboard-style: KPI cards (MRR, ARR, Pipeline, Velocity)
- Charts: revenue trend (bar), pipeline by stage (funnel), cohort heatmap
- Forecast panel: weighted pipeline → projected close
- Table: deals closing this month with probability
- Empty: "No revenue data yet — add deals in Sales"
- Reuse `Card` component from analytics
- Icon: already in ICONS as `analytics` (re-use)

**API Endpoints:**
```
GET /revenue-analytics/kpis?from=&to=
GET /revenue-analytics/trend?from=&to=&interval=
GET /revenue-analytics/pipeline-funnel?from=&to=
GET /revenue-analytics/cohorts?from=&to=
GET /revenue-analytics/forecast?from=&to=
GET /revenue-analytics/closing-soon?from=&to=
```

---

### 4. Accounting (Native Accounting Integration)

**Backend (`apps/api/src/modules/accounting/routes.ts`)**
- Tables: `accounting_accounts`, `accounting_journal_entries`, `accounting_journal_lines`, `accounting_tax_rates`, `accounting_invoices`, `accounting_payments`
- Chart of accounts: CRUD (standard types: asset, liability, equity, revenue, expense)
- Journal entries: double-entry, balanced validation, draft/posted/void states
- Invoices: create from leads/proposals, link to journal entries
- Payments: allocate to invoices, create journal lines
- Tax rates: CRUD, apply to invoice lines
- Reports: trial balance, P&L, balance sheet (computed)
- Permissions: owner/admin (accountant role later)

**UI (`apps/web/src/app/(workspace)/accounting/page.tsx`)**
- Tabs: Chart of Accounts | Journal Entries | Invoices | Reports
- Chart of Accounts: tree/table with type badges, balance column
- Journal Entries: list with filter (status, date), create modal (double-entry form with running balance check)
- Invoices: list from proposals/leads, create from proposal, record payment
- Reports: selector (trial balance / P&L / balance sheet) + date range + export
- Empty: "Set up your chart of accounts to start"
- Icon: `M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6` (ledger)

**API Endpoints:**
```
GET    /accounting/accounts
POST   /accounting/accounts
PATCH  /accounting/accounts/:id
DELETE /accounting/accounts/:id
GET    /accounting/journal-entries
POST   /accounting/journal-entries
POST   /accounting/journal-entries/:id/post
GET    /accounting/invoices
POST   /accounting/invoices
POST   /accounting/invoices/:id/payment
GET    /accounting/reports/trial-balance?from=&to=
GET    /accounting/reports/pnl?from=&to=
GET    /accounting/reports/balance-sheet?as_of=
```

---

### 5. Workflow Builder (Custom Workflow Builder)

**Backend (`apps/api/src/modules/workflow-builder/routes.ts`)**
- Tables: `workflow_definitions`, `workflow_executions`, `workflow_step_runs`
- Definition: nodes (trigger, action, condition, delay, webhook), edges, version
- Visual builder state: JSON (nodes + edges + viewport)
- Execute: async worker processes DAG, supports retries, compensation
- Variables: input schema, output schema, secrets reference (from ai_providers)
- Permissions: owner/admin/analyst manage; member read executions

**UI (`apps/web/src/app/(workspace)/workflow-builder/page.tsx`)**
- List: definitions with version, last run, status, run button
- Builder: canvas (React Flow style — minimal), palette (trigger/action/condition/delay/webhook), properties panel
- Execution view: timeline with step status, input/output inspector, retry failed
- Empty: "Build your first workflow — drag nodes from the palette"
- Icon: `M4 4v16M20 4v16M4 12h16` (flow lines)

**API Endpoints:**
```
GET    /workflow-builder/definitions
POST   /workflow-builder/definitions
GET    /workflow-builder/definitions/:id
PATCH  /workflow-builder/definitions/:id
DELETE /workflow-builder/definitions/:id
POST   /workflow-builder/definitions/:id/run
GET    /workflow-builder/definitions/:id/executions
GET    /workflow-builder/executions/:id
POST   /workflow-builder/executions/:id/retry
```

---

### 6. White Labeling (White-Label Customization)

**Status: built 2026-09-25. Option (B) chosen — public `GET /api/v1/branding` resolving the org from the `Host` header.**

#### The one decision that needs sign-off

White-label only means something if branding reaches the **unauthenticated login page**. The login page has no
session and no `x-organization-id`, so it cannot call the tenant-scoped `/settings/white-label`.

Options:

- **(A) Ship the settings page + live preview only.** Zero new attack surface. But nothing outside the settings
  page ever reads the stored values, so the feature is inert until a second slice wires the login page.
- **(B) Also add a public, read-only `GET /branding`** that resolves the org from the request `Host` header by
  matching `customDomain`, and have the login page consume it. Returns a **public-fields-only** projection
  (product name, tagline, logo, favicon, colours, login background) — never `emailReplyTo`, terms, or any
  other internal field. This is what makes custom domains actually work.

**Recommendation: (B).** It is ~30 extra lines and it is the difference between a working feature and a dead
settings page. It is safe *because* the response is a deliberate public-by-design allowlist, not a row dump.
Custom-domain DNS/SSL provisioning stays a placeholder — the user configures it.

#### Table — `white_label_settings` (one row per org)

Appended to `apps/api/src/db/schema.ts` (`organizationId` has a unique constraint — that is what enforces
"single record per org" and makes the upsert safe without an application-level check):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid → `organizations.id` | **unique** |
| `product_name` | varchar(120) | replaces "Business AI OS" on login |
| `tagline` | varchar(200) | replaces "Smarter Business. Powered by AI." |
| `logo_key` / `favicon_key` / `login_background_key` | text | MinIO keys, **not** presigned URLs — URLs expire, keys do not |
| `primary_color` / `secondary_color` | varchar(9) | `#RRGGBB`, validated |
| `font_family` | varchar(100) | enum-ish allowlist, not free text |
| `custom_css` | text | **deferred — see below** |
| `custom_domain` | varchar(255) | unique when set; stored lowercase, no scheme, no port |
| `email_from_name` / `email_reply_to` | varchar | validated email |
| `terms_url` / `privacy_url` | varchar | url-or-empty |
| timestamps | | `updatedAt` set on every write |

**`custom_css` is deliberately cut.** Injecting operator-supplied CSS is a stored-XSS vector, and serving it
safely needs sanitisation plus CSP work that is its own slice. Not in scope; add when someone actually needs
it and with a sanitiser.

#### API — `apps/api/src/modules/white-label/routes.ts`

```
GET    /settings/white-label                 -> settings (owner/admin read)
PUT    /settings/white-label                 -> upsert            [org.settings.manage]
POST   /settings/white-label/assets/:type    -> multipart upload  [org.settings.manage]
DELETE /settings/white-label/assets/:type    -> clear asset       [org.settings.manage]
GET    /branding                             -> PUBLIC, no auth, Host-header resolution
```

- Reuse the **existing** `org.settings.manage` permission (owner/admin) rather than adding a parallel
  `white-label.manage` — branding *is* org settings, and one gate is easier to reason about than two.
- Reuse `uploadFile` / `deleteFile` / `buildTenantKey` from `src/integrations/storage/index.ts` and the exact
  multipart shape from `apps/api/src/modules/knowledge/routes.ts:54` (`c.req.formData()`, size + MIME guards).
- Asset types: `logo` | `favicon` | `loginBackground`. Allow `image/png|jpeg|webp|svg+xml` only, and cap size.
  Store the key; resolve a presigned URL at read time via `getFileUrl`.
- `GET /branding` must be mounted **outside** `protectedApp` in `main.ts` (it is the only public route in this
  module). Strip the port from `Host`, lowercase, match `customDomain`; 404 quietly when no match so it does
  not confirm which hosts are tenants.

#### UI — `apps/web/src/app/(workspace)/settings/white-label/page.tsx`

Settings sub-page, matching the existing `settings/*` pages (labelled inputs, `role="alert"`/`status`,
loading/empty/error states, disabled-while-busy):

- **Brand** — product name, tagline
- **Assets** — logo / favicon / login background upload with current-value preview
- **Colours** — `<input type="color">` primary/secondary with a live swatch
- **Typography** — font family select
- **Domain** — custom domain input + a copyable DNS/SSL instruction block
- **Email / Legal** — from-name, reply-to, terms URL, privacy URL
- **Live preview** — a mock login card rendering the *current, unsaved* form state

#### Registry + nav

- `module-registry/routes.ts`: `white-label` → `enabled: true, comingSoon: false, uiAvailable: true`
- `layout.tsx` NAV: `{ href: '/settings/white-label', label: 'White Label', moduleId: 'settings' }`
  (settings sub-page, so it hangs off the `settings` module gate, not its own)

#### Tests — `tests/integration/white-label.test.ts`

Follow the `tests/integration/billing.test.ts` mock pattern (non-persistent mock DB → use literal ids, and
`expect([200, 201, 404]).toContain(res.status)`). Cover: get empty, put creates, put validates bad colour /
bad email / bad URL, non-owner gets 403 on put, `GET /branding` returns the public allowlist **and** does not
leak `emailReplyTo` / `termsUrl`, unknown Host 404s, unauthenticated request to `/branding` still succeeds.

#### Definition of done

- [x] `white_label_settings` in `schema.ts`, `tsc` clean immediately after (see the schema-corruption warning)
- [x] routes + public `/branding` with the public-fields allowlist
- [x] registry flipped, NAV entry added
- [x] settings page with live preview
- [x] integration tests green — 38 in `tests/integration/white-label.test.ts`
- [x] `tsc --build` 0 · web `tsc` 0 · eslint 0 · prettier clean · full vitest run · `next build` clean
- [x] login page consumes `/branding`
- [x] `custom_domain` unique index + 409 on a domain another org already claimed
- [x] table shipped in `apps/api/drizzle/0003_red_firebrand.sql`

**Known gaps, deliberately not wired:** `termsUrl` / `privacyUrl` are stored but not rendered anywhere (the
public allowlist excludes them), and `emailFromName` / `emailReplyTo` are stored but no outbound mail reads them.

---


### 7. Billing (Subscription & Billing Management)

**Backend (`apps/api/src/modules/billing/routes.ts`)**
- Tables: `billing_plans`, `billing_subscriptions`, `billing_invoices`, `billing_payment_methods`, `billing_usage_records`
- Plans: name, description, price_cents, interval (month/year), features[], limits{}, stripe_price_id (optional)
- Subscriptions: org_id, plan_id, status (trial/active/past_due/canceled), current_period_end, stripe_subscription_id
- Invoices: generated on renewal, PDF (placeholder), payment status
- Usage: track meterable features (seats, API calls, storage) — aggregate for overage
- Webhooks: Stripe/Paddle handler (placeholder — returns 200, logs)
- Permissions: owner/admin manage; member read own subscription

**UI (`apps/web/src/app/(workspace)/settings/billing/page.tsx`)**
- Current plan card: name, price, status, next billing date, cancel/change
- Available plans: grid with features, limits, "Upgrade"/"Downgrade" buttons
- Payment methods: list + add (Stripe Elements placeholder)
- Invoices: table with download, status badges
- Usage: progress bars for metered features
- Empty (no subscription): "Choose a plan to continue" with plan cards
- Icon: `M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6` (credit card style)

**API Endpoints:**
```
GET    /billing/plans
GET    /billing/subscription
POST   /billing/subscription
PATCH  /billing/subscription
DELETE /billing/subscription
POST   /billing/subscription/change-plan
GET    /billing/invoices
GET    /billing/invoices/:id/pdf
GET    /billing/payment-methods
POST   /billing/payment-methods
DELETE /billing/payment-methods/:id
GET    /billing/usage?from=&to=
POST   /billing/webhooks/stripe
```

---

### 8. API Marketplace (Public API Marketplace)

**Backend (`apps/api/src/modules/api-marketplace/routes.ts`)**
- Tables: `api_products`, `api_subscriptions`, `api_keys`, `api_usage`
- Product: name, description, category, base_url, auth_type (api_key/oauth/jwt), endpoints[], pricing (free/tiered), publisher_id, status
- Subscription: org_id, product_id, plan_id, api_key (hashed), status, rate_limit
- Keys: generate/revoke/rotate, scopes, rate limits
- Usage: per-key counters, aggregated for billing
- Discovery: public browse (no auth), subscribe (auth required)
- Permissions: owner/admin publish/manage; member subscribe

**UI (`apps/web/src/app/(workspace)/api-marketplace/page.tsx`)**
- Browse: product cards with category, auth type, pricing, "Subscribe"
- Product detail: endpoints table (method, path, description, params), pricing tiers, rate limits
- My Subscriptions: list with API key reveal (once), usage charts, regenerate/revoke
- Developer docs: auto-generated from endpoints spec
- Empty: "Explore APIs — connect external services"
- Icon: `M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z` (api-ish) or reuse `analytics` icon

**API Endpoints:**
```
GET    /api-marketplace/products?category=&q=
GET    /api-marketplace/products/:id
POST   /api-marketplace/products/:id/subscribe
GET    /api-marketplace/subscriptions
GET    /api-marketplace/subscriptions/:id
POST   /api-marketplace/subscriptions/:id/regenerate-key
DELETE /api-marketplace/subscriptions/:id
GET    /api-marketplace/subscriptions/:id/usage?from=&to=
GET    /api-marketplace/products/:id/docs
```

---

## Cross-Cutting Tasks (Per Module)

For **each module**, these steps apply:

1. **Database** (if new tables):
   - Add Drizzle schema in `apps/api/src/db/schema.ts`
   - Generate migration: `node node_modules/drizzle-kit/kit.mjs generate:pg --out=drizzle`
   - (User runs migration via Docker)

2. **API Routes** (`apps/api/src/modules/<module>/routes.ts`):
   - Create Hono router with all endpoints
   - Mount in `apps/api/src/main.ts`
   - Add permission checks via `requirePermission`
   - Add audit logging for all mutations

3. **Module Registry** (`apps/api/src/modules/module-registry/routes.ts`):
   - Change `enabled: true`, `comingSoon: false`, `uiAvailable: true`
   - Add icon to ICONS in `layout.tsx`

4. **Web UI** (`apps/web/src/app/(workspace)/<module>/page.tsx`):
   - Follow existing page pattern (loading/error/empty/flash/busy)
   - Add to NAV in `layout.tsx` with icon
   - Add to module registry `uiAvailable: true`

5. **Tests** (`tests/integration/<module>.test.ts`):
   - Permission tests (owner 200, member 403, unauth 401)
   - CRUD contract tests
   - UI source contract tests in `foundation.test.ts`

6. **Verification:**
   - `node node_modules/typescript/bin/tsc --build` → 0
   - `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0
   - `node node_modules/eslint/bin/eslint.js "apps/**/src/**/*.{ts,tsx}"` → 0
   - `node node_modules/prettier/bin/prettier.cjs --check "apps/**/*.{ts,tsx}"` → clean
   - `node node_modules/vitest/vitest.mjs run` → all pass

---

## Implementation Order (Dependency-Aware)

| Phase | Modules | Reason |
|-------|---------|--------|
| 1 | `billing`, `automation` | High business value; billing needed for agent-marketplace/api-marketplace monetization |
| 2 | `agent-marketplace`, `api-marketplace` | Depend on billing for paid tiers |
| 3 | `revenue-analytics` | Extends existing analytics; no new tables |
| 4 | `accounting` | Standalone; complex but isolated |
| 5 | `workflow-builder` | Most complex UI; builds on automation concepts |
| 6 | `white-label` | Settings sub-page; minimal backend |

---

## Ponytail Checklist (Per Module)

- [ ] Does this need new tables? → Reuse existing where possible
- [ ] Stdlib does it? → Use native `crypto`, `Date`, `Intl` over libs
- [ ] Native platform feature? → `<input type="color">`, `<select>`, `<dialog>`
- [ ] Already-installed dependency? → Reuse `zod`, `hono`, `drizzle`, `date-fns` (check)
- [ ] One line? → Inline helpers over extracted utils
- [ ] Minimum code that works? → No speculative features, no "v2" hooks

---

## UI/UX Pro Max Rules (Per Module)

- [ ] Labelled inputs (`label htmlFor` + `id`)
- [ ] Loading state (`role="status"`) on every fetch
- [ ] Error state (`role="alert"`) with Retry
- [ ] Empty state with guiding copy + action hint
- [ ] Flash messages for mutations (success/error)
- [ ] Busy state on buttons during async
- [ ] Confirm destructive actions (`window.confirm`)
- [ ] Active nav indicator (pathname match)
- [ ] Mobile responsive (stack grids, `sm:` breakpoints)
- [ ] Reduced motion respected (no forced animations)
- [ ] Focus visible on all interactive elements

---

## Deliverables Per Module

```
apps/api/src/modules/<module>/
  routes.ts          # API endpoints
apps/api/src/db/schema.ts       # +table definitions (if needed)
apps/api/drizzle/...            # +migration (generated)
apps/web/src/app/(workspace)/<module>/
  page.tsx           # Main UI page
tests/integration/<module>.test.ts  # Integration tests
# Updates to:
apps/api/src/main.ts            # +route mount
apps/api/src/modules/module-registry/routes.ts  # +enabled/uiAvailable
apps/web/src/app/(workspace)/layout.tsx  # +NAV entry + ICON
tests/integration/foundation.test.ts  # +UI source contracts
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| pnpm blocked (prisma approve-builds) | Use `node node_modules/...` direct invocations |
| Docker required for migrations | Document exact commands; user runs |
| Module interdependencies | Build in dependency order; mock where needed |
| Scope creep | Strict acceptance criteria per module; no "v2" features |
| Test maintenance | One test file per module; shared helpers in foundation |

---

## Next Steps

1. **User reviews plan** — confirm scope, order, any adjustments
2. **Phase 1 start** — `billing` + `automation` (parallel where possible)
3. **Per-module cycle**: DB → API → UI → Tests → Verify → Registry update
4. **Final**: Full regression (189+ new tests), toolchain green, handoff updated