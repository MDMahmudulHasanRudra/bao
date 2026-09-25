# Release Checklist — Business AI OS

**Local baseline 2026-09-24 (post Slices A–G):** lint 0 · typecheck 0 (root + web) · prettier 0 · test **189/189** · live `/health` 200 (prior rebuild). CI checkbox below still requires a real `.github` run after committing A–F (R-001).

## Pre-release
- [ ] CI green: lint, format:check, typecheck, test (`.github/workflows/ci.yml`) — **pending (no git/CI yet)**
- [x] Local: lint / typecheck / test exit 0 (direct `node node_modules/...` when pnpm blocked)
- [ ] **Dependency security audit (required gate):** `pnpm audit` — fail release on any **high/critical** finding; attach output to release notes
- [ ] **License review (required gate):** `pnpm licenses list` (or approved license-checker) — no disallowed/copyleft licenses outside the approved allowlist; attach output to release notes
- [ ] No critical open findings on `docs/risk-register.md` — R-003 high is documented-mitigated; review R-001…R-009
- [ ] Migrations generated and reviewed (`apps/api/drizzle/`)
- [ ] Migrations applied on staging; app boots against migrated DB

## Security / config
- [ ] Production env has **no default secrets** (JWT/SESSION ≥32 chars, real `DATABASE_URL`, real storage keys, no `changeme`)
- [ ] `docker-compose.prod.yml` vars supplied via deployment environment
- [x] Cross-tenant tests pass (org-scoped queries; `tenant-isolation.test.ts`)
- [x] Role change RBAC enforced (`validateRoleChange`: strictly lower, no self-escalate)
- [x] Rate limiting enabled on public auth endpoints
- [x] Audit logging path verified for privileged actions (incl. AI/provider/assistant; `GET /audit` owner/admin)

## Data / recovery
- [ ] Fresh full backup taken: `./ops/backup.sh` (now archives **Postgres + MinIO + Redis** volumes; see script output)
- [ ] Restore drill documented (`docs/backup-restore-evidence.md`)
- [ ] Backup retention/encryption policy agreed (external storage)

## Runtime
- [x] `GET /health` healthy
- [ ] Worker connects to Redis; ingest job processes sample file
- [ ] Object storage reachable (MinIO/S3)
- [ ] Error/alert channel configured

## Release
- [ ] Tag/release notes; known risks linked
- [ ] Deploy → smoke test login, org switch, one core write path
- [ ] Rollback plan understood (`docs/rollback-plan.md`)

## Sign-off
| Role | Name | Date |
|------|------|------|
| Engineering | | |
| Security | | |
