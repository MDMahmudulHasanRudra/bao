#!/usr/bin/env bash
# Backup PostgreSQL + MinIO + Redis volumes for Business AI OS.
# Usage: DATABASE_URL=... ./ops/backup.sh [output-dir]
# Volume names are overridable (compose project prefix may differ):
#   MINIO_VOLUME=bao_minio_data REDIS_VOLUME=bao_redis_data ./ops/backup.sh
set -euo pipefail

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_URL="${DATABASE_URL:-postgresql://bao:changeme@localhost:5432/business_ai_os}"
MINIO_VOLUME="${MINIO_VOLUME:-bao_minio_data}"
REDIS_VOLUME="${REDIS_VOLUME:-bao_redis_data}"
mkdir -p "$OUT_DIR"

# --- PostgreSQL ---
if docker ps --format '{{.Names}}' | grep -q '^bao-postgres$'; then
  docker exec bao-postgres pg_dump -U bao -d business_ai_os -Fc \
    > "$OUT_DIR/db_${STAMP}.dump"
else
  pg_dump -Fc "$DB_URL" > "$OUT_DIR/db_${STAMP}.dump"
fi
echo "DB backup: $OUT_DIR/db_${STAMP}.dump"

# --- MinIO volume archive (skip gracefully if absent) ---
if command -v docker >/dev/null 2>&1 \
  && docker volume inspect "$MINIO_VOLUME" >/dev/null 2>&1; then
  docker run --rm -v "$MINIO_VOLUME":/data:ro -v "$OUT_DIR":/backup alpine \
    tar czf "/backup/minio_${STAMP}.tgz" /data
  echo "MinIO backup: $OUT_DIR/minio_${STAMP}.tgz (volume $MINIO_VOLUME)"
else
  echo "MinIO backup: SKIPPED (docker or volume '$MINIO_VOLUME' not found)"
fi

# --- Redis volume archive (queue/cache; skip gracefully if absent) ---
if command -v docker >/dev/null 2>&1 \
  && docker volume inspect "$REDIS_VOLUME" >/dev/null 2>&1; then
  docker run --rm -v "$REDIS_VOLUME":/data:ro -v "$OUT_DIR":/backup alpine \
    tar czf "/backup/redis_${STAMP}.tgz" /data
  echo "Redis backup: $OUT_DIR/redis_${STAMP}.tgz (volume $REDIS_VOLUME)"
else
  echo "Redis backup: SKIPPED (docker or volume '$REDIS_VOLUME' not found)"
fi

cat <<EOF
Restore:
  DB:     ./ops/restore.sh $OUT_DIR/db_${STAMP}.dump
  MinIO:  docker compose stop api worker; tar xzf $OUT_DIR/minio_${STAMP}.tgz -C /  (or untar into the $MINIO_VOLUME mount), then start
  Redis:  untar redis_${STAMP}.tgz into the $REDIS_VOLUME mount (stop worker/api first); Redis is a cache/queue — DB is the system of record
EOF
echo "OK $STAMP"
