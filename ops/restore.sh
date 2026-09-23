#!/usr/bin/env bash
# Restore a Business AI OS pg_dump backup.
# Usage: ./ops/restore.sh path/to/db_YYYYMMDDTHHMMSSZ.dump
set -euo pipefail

DUMP="${1:?usage: restore.sh <dump-file>}"
DB_NAME="${POSTGRES_DB:-business_ai_os}"
DB_USER="${POSTGRES_USER:-bao}"

if [[ ! -f "$DUMP" ]]; then
  echo "missing dump: $DUMP" >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -q '^bao-postgres$'; then
  # Drop/recreate schema objects owned by the app user, then restore.
  docker exec -i bao-postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
  docker exec -i bao-postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE ${DB_NAME};"
  docker exec -i bao-postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges \
    < "$DUMP"
else
  echo "host restore requires psql/pg_restore against DATABASE_URL" >&2
  exit 1
fi

echo "OK restored from $DUMP"
