# Reality Audit and Vertical-Slice Delivery Backlog

Prompt 13 deliverable. Evidence date: 2026-09-23. Sources: source code inspection (apps/api, apps/web, apps/worker, packages, tests), live runtime (docker compose stack), toolchain results, and the two governing specs (`ai-provider-and-model-settings-spec.md`, `functional-delivery-execution-plan.md`).

## Classification legend

| Class | Meaning |
|---|---|
| **Functional** | Real data path end-to-end (UI → API → persistence/runtime) with auth/tenant scoping; usable today |
| **Partial** | Backend or UI exists but a material part of the contract is missing (permissions, producers, states, workflow) |
| **Shell** | Route/UI exists but renders placeholder or does not call the real contract; or API exists with no UI |
| **Unavailable** | Neither UI nor working API path |
| **Coming Soon** | Explicitly flagged non-goal in module registry |

## Skills used for this audit

- **Ponytail (full)** — active; ladder applied (audit = evidence only, no speculative redesign; reuse existing patterns in backlog).
- **UI/UX Pro Max** — instructions read; `search.py` queries run: `settings form` / `loading error empty state` (domain ux), `dashboard` (stack nextjs). Grounding rules adopted for UI acceptance criteria: submit must show loading→success/error; inputs need associated labels; errors announced via `role="alert"`; empty states must guide with an action; active nav item must be visually indicated; errors need a recovery path. No security/testing skill was invented — none installed for those domains.

## 1. Module classification

### Frontend (`apps/web` — 5 pages, 2 layouts, 1 api lib, no `components/`)

| Route | Class | Evidence |
|---|---|---|
| `/login` | **Functional** | Real `POST /identity/login` + `GET /identity/me` via `src/lib/api.ts:80-105`; error `role="alert"` (`login/page.tsx:76`); pending button state (`:83-86`) |
| `/` (root) | Functional | `redirect('/dashboard')` (`page.tsx:3-5`) |
| `(workspace)/layout` | **Partial** | Session auth guard works (`layout.tsx:27-37`); fixed `w-60` sidebar **no mobile collapse** (`:49`); Unicode glyph icons (⌂ ▤ ✦); static "Coming Soon" list (`:18`) not tied to `/modules` response |
| `/dashboard` | **Functional** | Real `Promise.all([/dashboard, /modules])` (`dashboard/page.tsx:45-48`); loading (`:64-66`), error (`:68-74`), empty states (`:118`, `:143`); cancelled-flag cleanup (`:41-62`) |
| `/settings`, `/knowledge`, `/sales`, `/proposals`, `/assistant`, `/presentations`, `/intelligence`, any other | **Shell** | Catch-all `[...path]/page.tsx:14` — "not built yet" static card, no fetch. **No `settings/` route exists** |
| Components / design system | **Partial** | No `src/components/`; `globals.css` defines `--color-brand-*` tokens (`:3-15`) that **nothing references** — pages use raw `slate/indigo/emerald` classes; dark-mode vars overridden by `bg-slate-50` body |

UI deps: next 16, react 19, tailwind 4, zod. **Absent:** icon lib, UI kit, data-fetch lib, form lib, chart lib. No `loading.tsx` / `error.tsx` / `not-found.tsx`.

### Backend (`apps/api` — all protected routes behind `authMiddleware` + `tenantMiddleware`, `main.ts:49-50`)

| Module | Class | Evidence |
|---|---|---|
| identity | Functional | register/login/me; rate limits on register/login (`identity/routes.ts:13,30`); audit `user.login` |
| organizations | Functional | tenant-scoped CRUD; PUT requires owner/admin (`organizations/routes.ts:65`); audited |
| access-control | Functional | invite/role-change/remove; `validateRoleChange` hierarchy + self/last-owner guards (`access-control/routes.ts:32-53,164-176`); audited |
| knowledge (+search) | Functional (API) | upload/url/get/delete/download, hybrid search; queue enqueue by IDs only (`routes.ts:88-93,127-131`); **no role checks** beyond tenancy; UI = Shell |
| worker (`knowledge-ingest`) | Functional | tenant-bound job load, S3 prefix `org/{orgId}/`, SSRF policy, transactional chunk replace; 16 tests; payloads carry **no secrets** |
| ai-assistant | **Partial** | conversations/messages work; completion via **hard-coded env provider** (`ai-provider/adapter.ts:76-93`: `if (env.AI_PROVIDER==='openai')`, key=`env.AI_API_KEY`, model=`env.AI_MODEL`); no per-org resolution (`model_policy` jsonb never read/written — `schema.ts:165`); no role checks; errors swallowed into apology string (`service.ts` via `adapter.ts:136-143`); **no UI** |
| sales | Functional (API) | full CRUD + stage-transition validation (`sales/routes.ts:282-295`) + pipeline summary; audited; UI = Shell |
| proposals | **Partial** | templates/drafts/approve + Presenton adapter; no UI; review workflow minimal |
| presentations | **Partial** | create/status + Presenton `provider_job_id`; env-configured adapter; no UI |
| intelligence | **Partial** | targets/events; POST targets checks `['owner','admin','analyst']` (`intelligence/routes.ts:30-32`) but **PUT/DELETE targets have no role check** (`:56,84`); ScrapLink adapter; no UI |
| notifications | **Partial** | read/read-all exist; **no producers found** feeding `notifications` rows; no UI |
| dashboard | Functional | aggregates pipeline/activities/knowledge/AI stats, tenant-scoped; consumed by UI |
| settings | **Partial** | GET/PUT `organizations.settings` jsonb; PUT owner/admin (`settings/routes.ts:28-30`); **no shape validation** (wholesale overwrite `:35-39`); no AI-provider settings; UI = Shell |
| analytics | **Partial** | `/sales`, `/knowledge` endpoints only; hidden from viewer in registry (`module-registry/routes.ts:158`); no UI |
| module-registry | Functional (mechanism) / **contract gap** | 16 modules; 10 marked `enabled:true` including knowledge, ai-assistant, sales, settings… **whose UI is a Shell** — violates "statuses are contracts backed by real capability" (execution plan) |
| audit | **Partial** | insert-only, 29 call sites, errors swallowed (`audit/service.ts:26-28`); **no read endpoint**; no AI/provider/assistant events |

### Platform cross-cuts

| Concern | Class | Evidence |
|---|---|---|
| Tenant isolation | Functional | `tenantMiddleware` loads membership server-side (`tenancy/context.ts:30-42`); org scoping in every module; 45 tests incl. cross-tenant |
| Permission system | **Unavailable (as a system)** | No permission matrix; `ai.providers.manage` exists **only in the spec doc**; `requireRole()` defined (`context.ts:48-57`) but **never used**; role checks are ad-hoc inline allowlists |
| Secret storage / encryption | **Unavailable** | Zero `node:crypto` / `createCipheriv` usage in `apps/`; AI key is process-wide env (`packages/config/src/index.ts` AI_*); **shared across all orgs**; DB has no provider/credential table |
| Queue hygiene | Functional | payloads = IDs/URLs/mime only; worker creds from env |
| Audit trail | Partial | best-effort inserts; no read API; AI/provider actions unlogged |
| Runtime (dockerized) | Functional | 6 containers healthy 2026-09-23; `/ready` postgres+redis ok; web 200 (Prompt 12b evidence) |
| Tests | Partial | 45/45 green; no tests for AI adapter, settings, encryption, module-registry, proposals/intelligence/notifications |
| Secrets in repo | Functional | `.env` git-ignored; `.dockerignore` excludes `.env`; committed `.env.example` has placeholders only |

### Dashboard element classification (`dashboard/page.tsx`)

| Element | Class | Evidence |
|---|---|---|
| Greeting header | Functional | time-of-day, user from session |
| 4 stat cards | Functional | from `/api/v1/dashboard` |
| Sales pipeline list | Functional | real leads by stage; empty → "No leads yet." |
| Recent activity | Functional | real activities; empty state present |
| Knowledge / AI Usage cards | Partial | counts real; AI usage = provider env process-wide, not per-org policy (no org AI config exists) |
| Quick actions | Shell | static links into catch-all routes |
| "Your Modules" grid | Partial | labels from `/modules`, but `enabled:true` over-claims (see contract gap) |
| Ask Business AI entry | Unavailable | no entry point wired to assistant UI |

## 2. Cross-cutting gap register

**Contract gaps**
- C1: Module registry `enabled/comingSoon` does not reflect UI availability (10 modules claim active with shell UI).
- C2: Workspace layout hard-codes its own "Coming Soon" list instead of consuming `/modules`.
- C3: `ai_conversations.model_policy` column exists but is dead (never read/written).
- C4: `organizations.settings` accepts arbitrary unvalidated JSON.

**Auth/permission gaps**
- A1: No permission strings/matrix; `ai.providers.manage` unimplemented (spec requirement).
- A2: `requireRole` dead code; inconsistent inline allowlists (intelligence PUT/DELETE missing checks).
- A3: No route-level distinction between "any member" and "privileged read" for provider config (spec: config itself is manage-permission gated).

**Tenancy gaps**
- T1: AI provider/model config does not exist per-org — current design is single process-level provider (spec violation until P0-1).
- T2: No evidence of cross-org leak today; keep regression tests in P0-1.

**State/responsive/a11y gaps (UI/UX Pro Max criteria applied)**
- S1: No route-level `loading.tsx`/`error.tsx` boundaries; loading/error only on login+dashboard.
- S2: Empty states exist only on dashboard lists; settings/knowledge/etc. have none (no pages at all).
- R1: Sidebar fixed width, no hamburger/collapse → navigation unusable on mobile (<768px).
- R2: No active-route visual indicator risk once nav grows (currently pathname-based class exists — verify per slice).
- X1: Unicode glyphs instead of SVG icons; no focus-trap/dialog patterns; no skip link; errors on forms beyond login not standardized.
- X2: Design tokens defined but unused → visual inconsistency risk for new screens.

## 3. P0/P1/P2 backlog — bounded vertical slices

Order respects `functional-delivery-execution-plan.md`. Every slice ships backend + API + UI + states + permissions + tests together (permanent instruction).

### P0-1 — AI Provider and Model Settings *(first delivery slice — priority per Prompt 13)*

- **Why first:** spec-mandated; unblocks per-org assistant/RAG resolution (P1-2); removes shared-env key design.
- **Evidence of gap:** no `ai_providers` table; no encryption (`grep createCipheriv` = 0); adapter hard-codes OpenAI+env key (`adapter.ts:33-43,76-93`); no `ai.providers.manage`; settings UI = catch-all shell.
- **Affected files/routes:**
  - DB: `apps/api/src/db/schema.ts` (+migration `apps/api/drizzle/`), new tables `ai_providers` (org_id, provider, label, encrypted_key, key_suffix, status, last_tested_at, last_test_result, created/updated_by), `ai_model_defaults` (org_id, capability, model_id, updated_by). Capabilities: `chat_rag`, `embeddings`, `proposal_draft`, `presentation_brief`, `evaluation`.
  - Crypto: new `apps/api/src/core/security/secret-box.ts` — AES-256-GCM, key from `ENCRYPTION_KEY` (32-byte, required in prod config, dev default documented in `.env.example`); encrypt before insert, decrypt only in-process for adapter calls; never log.
  - Permission: extend `tenancy/context.ts` with `requirePermission(c, 'ai.providers.manage')` mapping (owner/admin ⇒ manage) — first entry of a real matrix (kills A1 incrementally).
  - Adapter registry: rewrite `integrations/ai-provider/` as registry `{ openrouter, openai, gemini, anthropic, openai-compatible(approved) }` with per-provider: baseURL, key header, model-list endpoint (or server-maintained catalogue fallback), capability tags, `testConnection()`, timeouts+rate limits. Runtime resolves: org policy → capability default → adapter. No browser keys, no queue keys, no log keys.
  - API: new `modules/ai-settings/routes.ts` mounted at `/ai-settings`: `GET /providers` (masked only), `POST /providers`, `POST /providers/:id/test`, `POST /providers/:id/rotate`, `POST /providers/:id/revoke`, `PATCH /providers/:id` (enable/disable/label), `GET /models?capability=`, `GET/PUT /defaults`. All gated `auth+tenant+requirePermission`; all audited (`ai.provider.create/test/rotate/revoke/update`, `ai.model_default.update`) with actor/org/provider/result, **no secret content**.
  - Runtime wiring: `ai-assistant/service.ts` + `retrieval.ts` resolve org policy via registry; safe error when no enabled compatible model.
  - UI: real `apps/web/src/app/(workspace)/settings/ai-providers/page.tsx` (+ settings layout): provider cards (Connected/Needs attention/Disabled, selected models, last test), connection wizard (select → password key field → verify → models → capability defaults → confirm), capability default selectors with compatibility validation and "no compatible model" empty state; loading / first-empty / validation / failed-verification / unauthorized (403 message) / provider-outage / mobile states; masked key everywhere (suffix only); key field cleared after submit, never re-rendered.
  - Worker: none required (no async provider jobs in this slice); confirm queue payloads untouched.
  - Config: add `ENCRYPTION_KEY` to `packages/config` (required min 32 chars when `NODE_ENV=production`), `.env.example` entry.
- **Acceptance criteria (from spec):** admin connect/test/select compatible models; non-manage members get 403 on all mutate/test routes and cannot read config; DB/log/queue/browser show no plaintext key (masked suffix only); org A cannot reach org B config by any route; assistant resolves configured policy or returns safe error; rotate/revoke/disable audited with fallback behavior.
- **Dependencies:** none (foundation auth/tenancy already functional).
- **Verification:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`; new tests: unit (secret-box roundtrip/tamper), permission (member 403 / owner 200), tenant isolation (org A vs B provider rows), provider-failure (testConnection timeout/401 → user-actionable safe error, no key echo), no-leak assertions (GET responses + audit details + log line patterns); manual: docker stack, login demo owner, full wizard on :3000, dev-tools inspect sessionStorage/DB.
- **Skills:** Ponytail (full) — registry over scattered conditionals, one `requirePermission` over per-route copies; **UI/UX Pro Max** — apply searched UX rules (submit loading→success/error, labelled inputs, `role="alert"` errors, guiding empty states, active nav); no security skill installed — crypto follows Node stdlib (ladder rung 3).

### P0-2 — Foundation reconciliation: truthful module contract + permission seed

- **Evidence:** C1/C2/A1/A2 above.
- **Files:** `module-registry/routes.ts`, workspace `layout.tsx`, `tenancy/context.ts`, tests.
- **Scope:** registry `enabled` reflects real UI availability (mark shell modules honestly or add `uiAvailable` surfaced to nav); layout consumes `/modules` instead of hard-coded Coming Soon; land `requirePermission` helper (from P0-1) with matrix covering existing inline checks; wire dead `requireRole` or delete it.
- **Acceptance:** nav Coming Soon list = API source; no module claims active UI it lacks; permission helper unit-tested; intelligence PUT/DELETE gain role checks.
- **Deps:** P0-1 may land helper first (avoid duplication — implement helper inside P0-1, complete migration here).
- **Verification:** tests for registry truth + permission matrix; UI nav shows API-driven flags.
- **Skills:** Ponytail; UI/UX Pro Max (nav active/empty-state rules).

### P1-1 — Knowledge Hub UI (slice 3 of plan)

- **Evidence:** API functional (`knowledge/routes.ts`), worker functional, UI = shell catch-all.
- **Files:** `settings`-style real route `(workspace)/knowledge/page.tsx` (+ upload dialog, URL form, source list with status badges, search panel); reuse `lib/api.ts`.
- **Acceptance:** upload/URL intake with progress → `queued/processing/ready/error` from real status; delete with confirm; permission-aware list; loading/empty ("Add your first source")/error/retry states; mobile layout; no key material involved.
- **Deps:** P0-2 nav truth (soft).
- **Verification:** tests extended for status contract regex; manual ingest of txt/pdf via docker stack; `pnpm test`.
- **Skills:** Ponytail; UI/UX Pro Max.

### P1-2 — AI Assistant: org-policy resolution + cited answers UI

- **Evidence:** assistant API partial, env-only provider, apology-string failures, no UI.
- **Files:** `ai-assistant/*`, `ai-provider` registry consumption, `(workspace)/assistant/page.tsx`.
- **Acceptance:** chat UI against real conversations/messages; answers cite retrieved chunks; resolves org policy from P0-1 (safe error when unconfigured); permission-aware retrieval; loading/error/empty states; audited `ai.assistant.run`.
- **Deps:** **P0-1 required.**
- **Verification:** integration tests with mocked adapter; failure-path UI test; tenant tests.
- **Skills:** Ponytail; UI/UX Pro Max.

### P1-3 — Responsive workspace shell + route states

- **Evidence:** R1, S1, X1.
- **Files:** `(workspace)/layout.tsx`, new `loading.tsx`/`error.tsx`, `globals.css` token activation, SVG icon set (single set, no emoji).
- **Acceptance:** hamburger/collapse sidebar ≤768px; no horizontal scroll at 320px; active nav indicator; route error boundary with recovery (retry/back); reduced-motion respected; keyboard focus visible.
- **Deps:** none; coordinate with P0-2 nav changes.
- **Verification:** manual 320/768/1440 checks in docker web; a11y spot checks (labels, role=alert).
- **Skills:** UI/UX Pro Max (primary); Ponytail.

### P1-4 — Sales workspace UI

- **Evidence:** sales API functional, UI shell; dashboard already renders pipeline from same contract.
- **Files:** `(workspace)/sales/**` (companies/contacts/leads list+forms, pipeline board, activities timeline).
- **Acceptance:** full lifecycle incl. stage transition validation surfaced as friendly 403; ownership; empty/loading/error; audit-backed recent activity; mobile list views.
- **Deps:** P1-3 shell.
- **Verification:** e2e flow test extension; manual stage move; `pnpm test`.
- **Skills:** Ponytail; UI/UX Pro Max.

### P1-5 — Notification producers + inbox UI

- **Evidence:** table + read API exist, zero producers; no UI.
- **Files:** emit on invite/role change/knowledge ready/assistant reply/proposal approval; `(workspace)/notifications/page.tsx`; unread badge in shell.
- **Acceptance:** real events create rows scoped user+org; inbox lists/marks read; empty/loading states; no secret content in payloads.
- **Deps:** P1-1/P1-2 for their events (start with org/access events already audited).
- **Verification:** unit tests on emitters; manual multi-event flow.
- **Skills:** Ponytail; UI/UX Pro Max.

### P1-6 — Audit visibility + AI run events

- **Evidence:** no read endpoint; assistant/AI unlogged.
- **Files:** `modules/audit/routes.ts` (`GET /audit` manage-permission, masked details), assistant run audit; settings UI section (read-only list).
- **Acceptance:** owner/admin can list org audit events; provider/assistant actions present; secrets never in `details`.
- **Deps:** P0-1 events.
- **Verification:** permission + no-leak tests.
- **Skills:** Ponytail.

### P2-1 — Proposals + Presentations UI (plan slice 6)

- **Evidence:** APIs + Presenton adapter partial; no UI.
- **Acceptance:** versioned drafts, approval workflow UI, presentation request/status/output link; adapter failure states; audit.
- **Deps:** P0-1 for proposal/presentation capability defaults.
- **Verification:** adapter-mocked tests; manual flow.
- **Skills:** Ponytail; UI/UX Pro Max.

### P2-2 — Intelligence UI (plan slice 7)

- **Evidence:** API partial (PUT/DELETE role gap), ScrapLink adapter, no UI.
- **Acceptance:** targets CRUD with analyst+ roles enforced uniformly; reviewed events list; insight cards with source/freshness/empty rules (per dashboard definition).
- **Deps:** P0-2 permission helper.
- **Verification:** role tests incl. PUT/DELETE; manual scrape cycle (mock adapter).
- **Skills:** Ponytail; UI/UX Pro Max.

### P2-3 — Analytics + dashboard insight completion (plan slices 8–9)

- **Evidence:** analytics endpoints exist without UI; Ask AI entry missing; Diffy unwired.
- **Acceptance:** analytics page with real scoped metrics + empty states; dashboard gains Ask Business AI entry (after P1-2) and evidence-backed insight cards only; Diffy comparison action audited; settings completion (validated org settings shape — fixes C4).
- **Deps:** P1-2, P1-4.
- **Verification:** metric contract tests; card condition tests; full regression.
- **Skills:** Ponytail; UI/UX Pro Max.

## 4. Explicit non-goals (carry-forward from specs)

No client-side provider calls with user keys, no credential export, no billing, no live model-list promise for every provider (catalogue fallback allowed), no autonomous AI actions, no broad visual redesign before flow verification.

## 5. Next bounded task

**Implement P0-1 — AI Provider and Model Settings** exactly per `ai-provider-and-model-settings-spec.md`: schema+migration, `secret-box`, permission entry, adapter registry, `/ai-settings` routes with audit, org-policy resolution in assistant/retrieval, Settings → AI Providers UI with full state matrix, and the listed unit/permission/tenant/provider-failure/no-leak tests — one vertical slice, then re-run toolchain and update `CURRENT_STATUS.md`.
