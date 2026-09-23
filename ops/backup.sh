#!/usr/bin/env bash
# Backup PostgreSQL (and optionally document MinIO) for Business AI OS.
# Usage: DATABASE_URL=... ./ops/backup.sh [output-dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_URL="${DATABASE_URL:-postgresql://bao:changeme@localhost:5432/business_ai_os}"
mkdir -p "$OUT_DIR"

# Prefer docker compose service when present; fall back to host psql/pg_dump.
if docker ps --format '{{.Names}}' | grep -q '^bao-postgres$'; then
  docker exec bao-postgres pg_dump -U bao -d business_ai_os -Fc \
    > "$OUT_DIR/db_${STAMP}.dump"
else
  pg_dump -Fc "$DB_URL" > "$OUT_DIR/db_${STAMP}.dump"
fi

echo "DB backup: $OUT_DIR/db_${STAMP}.dump"
echo "NOTE: MinIO objects are volume-backed (minio_data); snapshot with 'docker run --rm -v bao_minio_data:/data -v \$PWD:/backup alpine tar czf /backup/minio_${STAMP}.tgz /data' or your object-store versioning policy."
echo "OK $STAMP"
