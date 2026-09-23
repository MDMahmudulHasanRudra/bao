# Business AI OS — Implementation Architecture and File Map

**Purpose:** Help a new implementation agent understand what exists, where it lives, how requests flow, and how to add the ERP-style product surface in small, reviewable tasks.

**Read first:** `../AGENTS.md` (the workspace-root instructions), then `../business-ai-os-blueprint/state/CURRENT_STATUS.md`, the technical master specification, project structure, data/security rules, roadmap, and the exact next prompt. This document supplements those sources; it does not override them.

## 1. Repository audit

The workspace root contains two sibling directories: `business-ai-os` (application repository) and `business-ai-os-blueprint` (product/architecture/prompt source). The repository currently has no Git metadata, so reviewers cannot rely on branch or diff output until that is repaired. Avoid broad renames or reorganization before restoring trustworthy change tracking.

### What is present

- pnpm TypeScript workspace with `apps/web`, `apps/api`, and `apps/worker`.
- Next.js App Router shell, Hono versioned API, Postgres/Drizzle schema and first migration, Redis/BullMQ worker, S3-compatible storage adapter.
- API routes for identity, organizations/access control, knowledge, AI assistant, sales, proposals, presentations, intelligence, dashboard, notifications, analytics, settings, and module registry.
- Shared contract types in `packages/contracts`; Zod environment configuration in `packages/config`.
- Release/operations docs in `business-ai-os/docs/`.
- Existing design image at workspace root: `software ui refarance.png`.

### What is not yet present or is only partial

- Frontend product workflows: `apps/web/src/app/page.tsx` is a title/subtitle page; no login, authenticated shell, dashboard or feature pages were found.
- Shared UI system: `packages/ui/src/index.ts` is empty.
- Backend layering: API features are largely single `routes.ts` files; the target domain/application/infrastructure/API split in the blueprint has not been implemented consistently.
- Worker coverage: current worker has document and URL job handling, but the Prompt 10 review found tenant-binding and placeholder-success issues. Resolve them before enabling knowledge ingestion for release.
- API documentation and client: typed contracts exist, but a complete OpenAPI/API client and endpoint-by-endpoint authorization contract were not found.
- Session bridge between browser and bearer-token API is not implemented/documented in application code.

Do not describe the backend as fully production-complete merely because route files exist. Treat existing code as a functional foundation that needs security/behavioral verification and explicit frontend wiring.

## 2. Current runtime map

```text
Browser (apps/web; Next.js :3001)
  └── HTTP requests to Hono API (apps/api; configured PORT)
        ├── global CORS / correlation ID / request logging
        ├── public identity routes
        └── protected API router
              ├── JWT authentication middleware
              ├── x-organization-id membership lookup
              └── module route handlers → Drizzle/PostgreSQL
                                      ├── Redis/BullMQ job enqueue
                                      ├── S3-compatible storage adapter
                                      └── server-side provider adapters

BullMQ worker (apps/worker)
  └── Redis queue → job processor → PostgreSQL / storage / provider adapters
```

This illustrates intended direction, not proof of complete implementation. Before production use, verify browser session transport, each module's authorization, every queue payload, adapter audit events, retries, and tenant scope end to end.

## 3. Current files and responsibilities

### Workspace root (`business-ai-os/`)

| Path | Current responsibility |
|---|---|
| `package.json` | Workspace commands for dev/build/lint/format/typecheck/test/db/Docker. |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Workspace package discovery and dependency lock. |
| `tsconfig*.json`, `eslint.config.js`, `vitest.config.ts` | TypeScript, lint, and test configuration. |
| `apps/` | Web, API, and worker applications. |
| `packages/` | Shared contracts, config, and (currently empty) UI package. |
| `infra/docker/` | Local and production Docker files. |
| `ops/` | Backup/restore scripts. |
| `docs/` | Operations, security, release and this product/architecture documentation. |
| `tests/` | Integration/e2e tests. Handoff indicates current tests are limited/mock-oriented; verify scope before treating as live-system evidence. |

### Frontend (`apps/web/src/`)

| Path | Current state / future responsibility |
|---|---|
| `app/layout.tsx` | Root HTML shell and metadata. Add global providers sparingly. |
| `app/page.tsx` | Current placeholder landing page. Replace only in a dedicated frontend prompt with public/authenticated route structure from `erp-product-and-ux-blueprint.md`. |
| `app/globals.css` | Tailwind 4 import, basic brand tokens, global body styles. Expand into deliberate semantic tokens; remove/replace automatic dark-mode behavior if it conflicts with chosen supported theme. |
| `package.json` | Next/React/Tailwind and scripts. Add dependencies only where they materially support approved UI behavior. |
| `next.config.js`, `postcss.config.js` | Framework/style build configuration. |

Proposed additions (not current files):

```text
apps/web/src/
├── app/(public)/...                    # login/register/invite routes
├── app/(workspace)/...                 # authenticated module routes/layout
├── components/                         # app-specific compositions
├── features/<module>/                  # module screens, forms, table/view models
├── lib/api/                            # typed fetch/client, errors, query helpers
├── lib/auth/                           # session and route gate integration
├── lib/organization/                   # validated active workspace selection
└── styles/tokens.css                   # if tokens are split from globals
```

Start with the smallest structure that gives screens clear boundaries. Avoid generic abstraction before a second real use case requires it.

### API (`apps/api/src/`)

| Path | Responsibility |
|---|---|
| `main.ts` | Creates Hono app, global middleware, public identity router, protected router, module mounts, and error handling. |
| `core/config/env.ts` | Re-exports validated environment loading. |
| `core/auth/jwt.ts` | JWT sign/verify and bearer auth middleware. |
| `core/tenancy/context.ts` | Organization membership lookup and request tenant context/role guard. |
| `core/errors/` | HTTP exceptions and normalized error handler. |
| `core/logging/`, `core/middleware/` | Correlation, structured logging and rate limiting. |
| `core/health/` | Health/readiness routes. |
| `db/schema.ts`, `db/index.ts`, `db/seed.ts` | Drizzle tables, DB connection, seed routine. |
| `modules/<module>/routes.ts` | Current feature HTTP handlers. Most business logic currently resides here. |
| `modules/ai-assistant/service.ts`, `retrieval.ts` | AI orchestration and permission-aware retrieval helpers. |
| `modules/knowledge/ingestion.ts`, `search.ts` | Ingestion helper and knowledge search route/helper. |
| `modules/audit/service.ts` | Audit write helper. |
| `integrations/*/adapter.ts` | Provider boundary modules (AI, Presenton, ScrapLink, Diffy); storage is `integrations/storage/index.ts`. |
| `jobs/queue.ts` | BullMQ queue access/creation. |
| `drizzle/` | Ordered SQL migration(s) and Drizzle metadata. |

Target structure from the approved architecture is per-module `domain`, `application`, `infrastructure`, `api`, and `tests`, with dependencies inward. Do not undertake a big-bang rewrite. For each feature change, extract a service only when needed and maintain route behavior/contracts. Cross-module data access must go through an explicit service/contract/event boundary.

### Worker (`apps/worker/src/`)

| Path | Responsibility |
|---|---|
| `main.ts` | BullMQ connection, worker registration, job dispatch and shutdown. |
| `ingest.ts` | Current text/url ingestion and SQL updates. Prompt 10 review flags tenant scope, empty-buffer document handling, URL failure-as-success, and retry idempotency. |
| `redis.ts`, `logger.ts` | Queue connection and structured logging. |

Future job processors should validate payload shape, load referenced records using the tenant ID in every lookup/write, be safe on retry, avoid logging secrets/content, and emit observable terminal status. Queue payloads are instructions, not proof of access.

### Shared packages

| Path | Responsibility / guardrail |
|---|---|
| `packages/contracts/src/index.ts` | Shared API entity/result interfaces. Evolve alongside API; define validation/request schemas deliberately. Avoid duplicating server-only configuration/secrets. |
| `packages/config/src/index.ts` | Zod environment validation and shared configuration types. Server-only secrets must not be imported into browser bundles. |
| `packages/ui/src/index.ts` | Currently empty. Add reusable, accessible visual primitives only when the first screens establish real shared patterns. |

## 4. Backend capability and endpoint map

All listed protected paths mount beneath `/api/v1` in `apps/api/src/main.ts`; normal protected requests currently require Bearer auth and `x-organization-id`. The table is an inventory from current route registrations, not a promise that every path is production-ready.

| Capability | Current routes (suffix) | Primary files |
|---|---|---|
| Identity | `POST /identity/register`, `POST /identity/login`, `GET /identity/me` | `modules/identity/routes.ts` |
| Organizations | `GET/POST /organizations`, `GET/PUT /organizations/:id` | `modules/organizations/routes.ts` |
| Membership/access | `GET /access-control/members`, `POST /access-control/invite`, `PUT /access-control/members/:id/role`, `DELETE /access-control/members/:id` | `modules/access-control/routes.ts` |
| Knowledge | `GET /knowledge`, `POST /knowledge/upload`, `POST /knowledge/url`, `GET/DELETE /knowledge/:id`, `GET /knowledge/:id/download`, `POST /knowledge/search` | `modules/knowledge/*`, worker |
| AI | `GET/POST /ai-assistant/conversations`, `GET /ai-assistant/conversations/:id`, `POST /ai-assistant/conversations/:id/messages` | `modules/ai-assistant/*`, AI adapter |
| Sales | Companies, contacts, leads CRUD; activities list/create; `GET /sales/pipeline` | `modules/sales/routes.ts` |
| Proposals | `GET/POST /proposals`, `GET/PUT /proposals/:id`, `POST /proposals/:id/approve`, templates GET/POST | `modules/proposals/routes.ts` |
| Presentations | list/create/detail/status | `modules/presentations/routes.ts` |
| Intelligence | targets GET/POST/PUT/DELETE; events GET and review PUT | `modules/intelligence/routes.ts` |
| Dashboard/analytics | dashboard GET; sales and knowledge analytics GET | `modules/dashboard/routes.ts`, `modules/analytics/routes.ts` |
| Notifications | list, mark one read, mark all read | `modules/notifications/routes.ts` |
| Settings/modules | settings GET/PUT; module registry GET and detail GET | `modules/settings/routes.ts`, `modules/module-registry/routes.ts` |
| Health | `GET /health`, `GET /ready` (outside `/api/v1`) | `core/health/health.ts` |

Before each screen is implemented, inspect its handler and document: request/response schema, auth/role rule, tenant/object scope, empty result shape, pagination/filter support, error codes, audit behavior, async state transitions, and whether the feature is actually enabled. Do not infer full CRUD from a module name.

## 5. Data and tenant boundaries

The schema currently contains 18 tables: organizations, users, memberships, audit events, knowledge sources/chunks, AI conversations/messages, companies, contacts, leads, activities, proposal templates/proposals, presentations, monitoring targets/intelligence events, notifications. This is a CRM/knowledge workflow schema, not a general ERP accounting or inventory model.

For every tenant-owned record and relationship:

1. Resolve authenticated user and membership server-side for the requested organization.
2. Scope reads and writes by `organization_id` and record ID together.
3. Validate linked company/contact/lead/source IDs against the same organization.
4. Enforce tenant relationships with database constraints where possible, not only client behavior.
5. Include organization ID in queue payloads and also revalidate it against authoritative data inside the worker.
6. Scope storage keys, signed URL generation, search/vector retrieval, exports, and cache keys to the tenant and object permission.
7. Add tests that attempt cross-tenant access by direct ID, list/search, relationships, async jobs, storage/download, and retry.

The current `tenantMiddleware` establishes membership context but does not by itself make every route query safe. Review each route. In particular see `docs/code-review-10.md` for the known worker source/org mismatch risk.

## 6. Frontend-to-backend request conventions

Create one browser-safe API client. It should:

- use a single configured API origin and consistent `/api/v1` path;
- attach the approved session credential and validated organization context through the chosen secure mechanism;
- parse the shared `ApiResponse<T>` / `ApiError` shape;
- normalize network, validation, authorization, not-found, rate-limit, and server errors;
- expose correlation IDs for support without exposing tokens or private context;
- avoid logging request bodies that include passwords, documents, AI context, or integration secrets;
- apply bounded timeouts and abort stale search requests;
- support server-rendered session checks where appropriate without leaking secrets to the client.

Do not create UI-specific endpoints or alter backend APIs solely for convenience without an explicit contract review. If an aggregate dashboard needs a new endpoint, document its queries, tenant scope, data freshness, and partial-failure behavior.

## 7. Safe implementation sequence for the future agent

The product guide and this file authorize planning documentation only. Product code implementation must be handled as separate numbered tasks and must repair the Prompt 10 blocker before release or real knowledge features are exposed.

1. **Resolve release blocker:** bind worker source and tenant with authoritative reads/writes; implement actual storage download/extraction; correct URL failure and SSRF behavior; make chunk writes idempotent; add real worker tenant/retry tests.
2. **Confirm auth/session contract:** decide secure cookie/BFF or other reviewed approach, CORS/CSRF, membership bootstrap/switch, expiration and logout behavior. Document API schemas.
3. **Establish frontend shell:** route groups, auth gate, organization switcher, navigation from module registry, responsive shell, design tokens, error boundary.
4. **Build identity screens:** login and only approved registration/invite flows; test expired, invalid, multi-organization and no-membership states.
5. **Build dashboard:** use verified aggregate endpoints, partial failures, responsive widget behavior and real empty/loading/error cases.
6. **Build enabled modules one at a time:** recommended sequence Knowledge list/intake/status; Assistant conversation/citations; Sales; Proposals; Presentations; Intelligence; notifications/settings/analytics.
7. **Extract shared UI patterns:** after actual reuse appears, move primitives to `packages/ui`, document props/accessibility, and avoid module business logic in the UI package.
8. **Release UX gate:** verify role-denied paths and tenant switching, keyboard and screen-reader flows, responsive layouts, real API failures, and no fabricated data.

Never begin several modules in one prompt. Keep each numbered task scoped and hand off with changed files, commands/evidence, known risks, and exact next prompt in `business-ai-os-blueprint/state/CURRENT_STATUS.md`.

## 8. Acceptance checklist for implementation tasks

### Product and UI

- User can identify active organization and current module at all times.
- Screen only exposes enabled capabilities and handles forbidden server responses safely.
- Loading, empty, error, unauthorized, stale/processing, and write-success states are implemented where relevant.
- Desktop, tablet, mobile, keyboard, zoom, accessible names, focus management, contrast, and status announcements are reviewed.
- All example/screenshot data is replaced with API data or clearly labeled non-production fixtures in tests only.

### API/data/security

- Contract and validation are documented; server authorization is authoritative.
- Tenant and object permission checks cover IDs, relationships, lists, retrieval, storage, jobs, and exports.
- Writes that enqueue work use reliable handoff, safe retries, and idempotent processing.
- Audit events cover security-sensitive/privileged/provider actions.
- Migration is justified and a safe baseline/forward/rollback strategy is documented.

### Evidence

- Run only the focused tests and checks required by the active prompt plus mandated project verification.
- State clearly which checks ran and whether they use mocks, real DB/Redis, storage, or provider services.
- Do not call a feature complete because its route exists or because TypeScript compiles.
