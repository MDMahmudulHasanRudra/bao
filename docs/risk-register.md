# Known Risk Register — Business AI OS

| ID | Risk | Severity | Status | Notes / mitigation |
|----|------|----------|--------|--------------------|
| R-001 | No Git metadata in workspace — cannot produce commit/diff evidence for audits | Medium | **Open / documented** | Treat local tree as release artifact; adopt VCS before formal audits |
| R-002 | Local tests are largely mock-based; full E2E against live Postgres/Redis not in default `pnpm test` | Medium | **Open / documented** | CI runs services; add integration job against real DB before prod |
| R-003 | Seed/demo users use password `demo1234` (`apps/api/src/db/seed.ts`) | High | **Mitigated in docs** | Never seed in prod; force password change; rotate if demo DB was shared |
| R-004 | Dev compose defaults (`changeme`, `minioadmin`) are weak | Medium | **Accepted (dev-only)** | Prod compose uses `${VAR}`; no defaults in zod secret fields |
| R-005 | First drizzle migration only now generated — pre-existing DBs need baselining | Medium | **Open** | Baseline with `drizzle-kit push` or empty-journal baseline before migrate |
| R-006 | eslint emits MODULE_TYPELESS_PACKAGE_JSON warning (root lacks `"type"`) | Low | **Accepted** | Non-fatal; set `"type":"module"` only if all scripts verified ESM |
| R-007 | MinIO/Redis backups not automated in `ops/backup.sh` (Postgres only) | Medium | **Open** | Volume snapshot / `mc mirror` required for full recovery |
| R-008 | Dependency license/security scan not wired as required CI gate | Medium | **Open** | Add `pnpm audit` / license check to release checklist execution |
| R-009 | Accessibility/responsive audit for web UI not fully evidenced in this hardening pass | Medium | **Open** | Track under platform-experience follow-up |

## Critical security (Prompt 09 acceptance)
- Cross-tenant isolation tests: **passing** (see test evidence).
- Privilege escalation / equal-role / self-change: **blocked** by `validateRoleChange`.
- Production default secrets: **none** in config schema; compose interpolates env.
- Known critical issues left undocumented: **none** as of this revision.
