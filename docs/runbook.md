# Operations Runbook — Business AI OS

## Stack (local, as of 2026-09-23)

| Service  | Default local          | Notes                          |
|----------|------------------------|--------------------------------|
| API      | `:5000` (Hono)         | Health: `GET /health` · API under `/api/v1/` |
| Web      | `:3000` (Next.js)      | App Router; workspace under authenticated shell |
| Worker   | BullMQ consumer        | Ingest jobs                    |
| Postgres | `:5432` pgvector pg16  | DB `business_ai_os`, user `bao`|
| Redis    | `:6379`                | Queues + cache                 |
| MinIO    | `:9000` / console `:9001` | Object storage             |

Demo login (dev only): `demo` / `demo1234`. Sign-in is by username, not email.

Start: `pnpm docker:up` · Stop: `pnpm docker:down` · Logs: `pnpm docker:logs`

**Agent rule:** never run Docker commands; the user builds/restarts images.

### Toolchain (pnpm currently blocked by prisma approve-builds — run directly)
```bash
node node_modules/typescript/bin/tsc --build
node node_modules/vitest/vitest.mjs run
node node_modules/eslint/bin/eslint.js "apps/**/src/**/*.{ts,tsx}" "packages/**/src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"
```
Baseline after P2-3: **160/160 tests**, tsc/lint/prettier clean. Typecheck web separately: `tsc -p apps/web` from `apps/web` (root project references omit web).

## Common procedures

### Deploy / release
1. Ensure CI green (`lint`, `format:check`, `typecheck`, `test`).
2. Confirm no default secrets in prod env (zod requires `DATABASE_URL`, `JWT_SECRET`, `SESSION_SECRET`, storage keys).
3. `pnpm build`
4. Run migrations: `pnpm db:migrate` (SQL in `apps/api/drizzle/`).
5. Start API + worker; verify `GET /health` and worker connects to Redis.

### Schema changes
1. Edit `apps/api/src/db/schema.ts`.
2. `pnpm db:generate` → review `apps/api/drizzle/000_*.sql`.
3. Apply with `pnpm db:migrate` against a staging DB first.
4. Deploy migration before code that depends on it when additive; reverse for drops (see rollback plan).

### Backup
```bash
DATABASE_URL=... ./ops/backup.sh ./backups
```
Postgres: `pg_dump -Fc`. MinIO + Redis: volume archives (`minio_<stamp>.tgz`, `redis_<stamp>.tgz`) written automatically when Docker volumes exist; volume names overridable via `MINIO_VOLUME`/`REDIS_VOLUME`.

### Restore
```bash
./ops/restore.sh ./backups/db_<stamp>.dump
```
Verified by local drill (see `docs/backup-restore-evidence.md`).

### Incident response (high level)
1. Detect via health checks, logs, audit anomalies.
2. Stop bleed: scale down affected worker/API route; rotate secrets if compromise suspected.
3. Restore data if corruption (backup.sh → restore.sh) or roll forward with fix.
4. Record timeline in incident log; file follow-ups on `docs/risk-register.md`.

## Secrets
- Prod compose interpolates `${VAR}` — set env outside git.
- Never commit `.env` real values. `.env.example` is placeholders only.
- Seed users use `demo1234` — change before any shared/demo deployment (risk R-003).

## Observability
- Request correlation IDs in API logs (pino).
- Audit events in `audit_events` for privileged actions (read via `GET /api/v1/audit` — owner/admin).
- Health endpoint for container orchestration probes.
