#!/bin/bash
# ─────────────────────────────────────────────────────────────
# backup.sh — Dump PostgreSQL database to a timestamped file
# Usage: bash scripts/backup.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-finance_db}
DB_USER=${DB_USER:-postgres}
export PGPASSWORD=${DB_PASSWORD:-postgres}

BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
BACKUP_RETENTION_COUNT=${BACKUP_RETENTION_COUNT:-7}
CROSS_REGION_BACKUP_DIR=${CROSS_REGION_BACKUP_DIR:-}

mkdir -p "$BACKUP_DIR"

echo "💾 Backing up ${DB_NAME} to ${BACKUP_FILE}..."

pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

echo "✅ Backup complete: $BACKUP_FILE ($(du -h $BACKUP_FILE | cut -f1))"

CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
cat > "${BACKUP_FILE}.meta" <<META
db_name=${DB_NAME}
created_at=${TIMESTAMP}
checksum_sha256=${CHECKSUM}
rpo_target_minutes=${RPO_TARGET_MINUTES:-5}
rto_target_minutes=${RTO_TARGET_MINUTES:-10}
META

echo "🧾 Backup manifest written: ${BACKUP_FILE}.meta"

if [ -n "$CROSS_REGION_BACKUP_DIR" ]; then
  mkdir -p "$CROSS_REGION_BACKUP_DIR"
  cp "$BACKUP_FILE" "$CROSS_REGION_BACKUP_DIR/"
  cp "${BACKUP_FILE}.meta" "$CROSS_REGION_BACKUP_DIR/"
  echo "🌍 Copied backup to cross-region directory: $CROSS_REGION_BACKUP_DIR"
fi

# Retention: keep only the configured number of backups
echo "🧹 Cleaning old backups (keeping last ${BACKUP_RETENTION_COUNT})..."
ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | tail -n +$((BACKUP_RETENTION_COUNT + 1)) | xargs -r rm --
ls -t "${BACKUP_DIR}"/*.sql.gz.meta 2>/dev/null | tail -n +$((BACKUP_RETENTION_COUNT + 1)) | xargs -r rm --
echo "✅ Cleanup done."
