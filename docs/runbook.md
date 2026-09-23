# Operations Runbook — Business AI OS

## Stack

| Service  | Default local          | Notes                          |
|----------|------------------------|--------------------------------|
| API      | `:8080` (Hono)         | Health: `GET /health`          |
| Web      | Next.js dev            |                                |
| Worker   | BullMQ consumer        | Ingest jobs                    |
| Postgres | `:5432` pgvector pg16  | DB `business_ai_os`, user `bao`|
| Redis    | `:6379`                | Queues + cache                 |
| MinIO    | `:9000` / console `:9001` | Object storage             |

Start: `pnpm docker:up` · Stop: `pnpm docker:down` · Logs: `pnpm docker:logs`

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
Postgres: `pg_dump -Fc`. MinIO: volume snapshot / `mc mirror` (see backup.sh note).

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
- Audit events in `audit_events` for privileged actions.
- Health endpoint for container orchestration probes.
