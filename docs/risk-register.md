# Known Risk Register — Business AI OS

Last reviewed: 2026-09-24 (full Slices A–G; R-009/R-007/R-008 prior). Test baseline: **189/189**.

| ID | Risk | Severity | Status | Notes / mitigation |
|----|------|----------|--------|--------------------|
| R-001 | No Git metadata in workspace — cannot produce commit/diff evidence for audits | Medium | **Partially mitigated 2026-09-24** | Repo exists on `main` (prior commits + origin). Slices A–F still uncommitted; no `.github` CI yet. Commit only when user asks. |
| R-002 | Local tests are largely mock-based; full E2E against live Postgres/Redis not in default `pnpm test` | Medium | **Open / documented** | 189 integration tests (mock DB/adapters); CI or live E2E job still needed before prod |
| R-003 | Seed/demo users use password `demo1234` (`apps/api/src/db/seed.ts`) | High | **Mitigated in docs** | Never seed in prod; force password change; rotate if demo DB was shared |
| R-004 | Dev compose defaults (`changeme`, `minioadmin`) are weak | Medium | **Accepted (dev-only)** | Prod compose uses `${VAR}`; no defaults in zod secret fields |
| R-005 | First drizzle migration only now generated — pre-existing DBs need baselining | Medium | **Open** | Baseline with `drizzle-kit push` or empty-journal baseline before migrate |
| R-006 | eslint emits MODULE_TYPELESS_PACKAGE_JSON warning (root lacks `"type"`) | Low | **Accepted** | Non-fatal; set `"type":"module"` only if all scripts verified ESM |
| R-007 | MinIO/Redis backups not automated in `ops/backup.sh` (Postgres only) | Medium | **Mitigated 2026-09-24 (script)** | `backup.sh` archives MinIO + Redis volumes alongside Postgres (`MINIO_VOLUME`/`REDIS_VOLUME` overridable); live run + restore drill still pending user Docker session |
| R-008 | Dependency license/security scan not wired as required CI gate | Medium | **Mitigated 2026-09-24 (checklist gate)** | Required Pre-release gates added: `pnpm audit` (fail high/critical) + license review; CI wiring still blocked on R-001 |
| R-009 | Accessibility/responsive audit for web UI not fully evidenced | Medium | **Mitigated 2026-09-24 (code + tests)** | Skip link, tabpanel/arrow-key tabs, contrast fixes, sr-only unread, responsive header — 6 contract tests; full browser/screen-reader click-through still pending after `bao-web` rebuild |

## Delivery note (2026-09-24)
Backlog P0-1…P2-3 + **full Slices A–G delivered** (invites/orgs, sales follow-ups, proposals versions/export, knowledge SOP/detail, integrations status, assistant `?c=`+suggestions, final handoff — see blueprint `CURRENT_STATUS.md` newest entry). C4 fixed (strict zod). R-009/R-007/R-008 mitigated. Remaining: R-001 commit A–F + CI, R-002 live E2E, R-005 baselining, R-003 drill, R-007 user backup run.

## Critical security (Prompt 09 acceptance)
- Cross-tenant isolation tests: **passing** (see test evidence).
- Privilege escalation / equal-role / self-change: **blocked** by `validateRoleChange`.
- Production default secrets: **none** in config schema; compose interpolates env.
- Known critical issues left undocumented: **none** as of this revision.
