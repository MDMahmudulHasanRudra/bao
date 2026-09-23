# Release Checklist — Business AI OS

## Pre-release
- [ ] CI green: lint, format:check, typecheck, test (`.github/workflows/ci.yml`)
- [ ] Local: `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test` exit 0
- [ ] No critical open findings on `docs/risk-register.md`
- [ ] Migrations generated and reviewed (`apps/api/drizzle/`)
- [ ] Migrations applied on staging; app boots against migrated DB

## Security / config
- [ ] Production env has **no default secrets** (JWT/SESSION ≥32 chars, real `DATABASE_URL`, real storage keys, no `changeme`)
- [ ] `docker-compose.prod.yml` vars supplied via deployment environment
- [ ] Cross-tenant tests pass (org-scoped queries; `tenant-isolation.test.ts`)
- [ ] Role change RBAC enforced (`validateRoleChange`: strictly lower, no self-escalate)
- [ ] Rate limiting enabled on public auth endpoints
- [ ] Audit logging path verified for privileged actions

## Data / recovery
- [ ] Fresh full backup taken: `./ops/backup.sh`
- [ ] Restore drill documented (`docs/backup-restore-evidence.md`)
- [ ] Backup retention/encryption policy agreed (external storage)

## Runtime
- [ ] `GET /health` healthy
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
