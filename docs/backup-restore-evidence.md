# Backup / Restore Evidence

**Date:** 2026-09-23  
**Environment:** Docker `pgvector/pgvector:pg16`, container `bao-drill-pg`, DB `business_ai_os`, user `bao`  
**Migrations under test:** `apps/api/drizzle/0000_dapper_magik.sql` (18 tables)

## Procedure

1. Start throwaway Postgres container (`pgvector/pgvector:pg16`).
2. Apply initial schema migration.
3. Insert synthetic tenant marker rows (`organizations`, `users`, `memberships`).
4. `pg_dump -Fc` → binary dump file under `backups/`.
5. `DROP DATABASE` + `CREATE DATABASE` (wipe).
6. `pg_restore` from dump.
7. Verify marker rows and table count.

## Commands (equivalent to `ops/backup.sh` / `ops/restore.sh`)

```bash
# backup
docker exec bao-drill-pg pg_dump -U bao -d business_ai_os -Fc -f /tmp/drill.dump
docker cp bao-drill-pg:/tmp/drill.dump backups/db_<stamp>.dump

# wipe
docker exec -i bao-drill-pg psql -U bao -d postgres -c "DROP DATABASE business_ai_os WITH (FORCE);"
docker exec -i bao-drill-pg psql -U bao -d postgres -c "CREATE DATABASE business_ai_os;"

# restore
docker cp backups/db_<stamp>.dump bao-drill-pg:/tmp/restore.dump
docker exec bao-drill-pg pg_restore -U bao -d business_ai_os --no-owner --no-privileges /tmp/restore.dump
```

> Note: on Windows, prefer `docker cp` / file-in-container for binary dumps; PowerShell stdin pipes corrupt binary `pg_dump` output.

## Results (run 2026-09-23)

| Step | Result |
|------|--------|
| Schema apply | PASS — 18 tables created |
| Seed markers | PASS — org + membership inserted |
| pg_dump | PASS — `backups/db_drill_pass.dump` size **51,800** bytes |
| Wipe | PASS — **0** public tables after drop |
| pg_restore | PASS |
| Marker `Drill Org` | PASS |
| Marker membership `owner` | PASS |
| Table count after restore | **18** (≥18) |

**Overall drill: `DRILL=PASS`**

## Gaps / follow-ups

- MinIO object backup not automated (volume snapshot / `mc mirror`) — tracked as R-007.
- Redis durability depends on AOF/RDB policy — document before prod.
- Host (non-Docker) restore path in `ops/restore.sh` still requires `pg_restore` on PATH.
