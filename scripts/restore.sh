#!/bin/bash
# -----------------------------------------------------------------------------
# restore.sh — Restore PostgreSQL from a compressed backup file
# Usage: bash scripts/restore.sh <backup_file.sql.gz>
# -----------------------------------------------------------------------------
set -euo pipefail

BACKUP_FILE=${1:-}
if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: bash scripts/restore.sh <backup_file.sql.gz>"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-finance_db}
DB_USER=${DB_USER:-postgres}
export PGPASSWORD=${DB_PASSWORD:-postgres}

echo "♻️ Restoring $DB_NAME from $BACKUP_FILE"

gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

echo "✅ Restore complete"
