# Rollback / Roll-Forward Plan

## When to roll back
- Health checks failing after deploy
- Critical security regression discovered post-release
- Data corruption or failed migration with no safe forward fix
- Error rate / latency beyond agreed SLO for >15 minutes

## Roll back (application)
1. Re-deploy previous known-good image/artifact (same env vars).
2. Confirm `GET /health` and critical login path.
3. Pause worker if new code wrote incompatible jobs; drain or DLQ bad jobs.

## Roll back (database)
Prefer **roll-forward** migrations. If rollback required:
1. Identify applied migration files in `apps/api/drizzle/`.
2. If down SQL exists, run it on staging first, then prod during a window.
3. If no down migration: restore last pre-change backup:
   ```bash
   ./ops/restore.sh ./backups/db_<pre-change>.dump
   ```
4. Point app back at previous release that matches that schema.

## Roll forward (preferred)
1. Keep current release stopped or feature-flagged.
2. Ship a fix migration + app fix that makes schema/data consistent.
3. Verify health, tenancy tests, and smoke checks before re-enabling traffic.

## Communication
- Record start/end, impact, root cause, follow-ups.
- Update `docs/risk-register.md` if a new systemic risk was revealed.

## Decision matrix
| Situation | Action |
|-----------|--------|
| Bad deploy, DB untouched | App rollback only |
| Bad migration, forward fix <1h | Roll forward |
| Data loss / corruption | Restore backup, then roll forward app if needed |
| Secret leak | Rotate secrets first; rollback optional |
