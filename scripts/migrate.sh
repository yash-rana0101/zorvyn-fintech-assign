#!/bin/bash
# ─────────────────────────────────────────────────────────────
# migrate.sh — Run PostgreSQL migrations in order
# Usage: bash scripts/migrate.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# Load .env if it exists
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-finance_db}
DB_USER=${DB_USER:-postgres}
export PGPASSWORD=${DB_PASSWORD:-postgres}

MIGRATIONS_DIR="src/db/migrations"

echo "🔄 Running migrations on ${DB_HOST}:${DB_PORT}/${DB_NAME}..."

# Wait for Postgres to be ready
for i in {1..30}; do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" > /dev/null 2>&1; then
    break
  fi
  echo "  Waiting for PostgreSQL... ($i/30)"
  sleep 2
done

# Run each migration file in sorted order
for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  ▶ Applying: $file"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"
done

echo "✅ Migrations complete."
