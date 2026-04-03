#!/bin/bash
# ─────────────────────────────────────────────────────────────
# seed.sh — Seed the database with initial data
# Usage: bash scripts/seed.sh
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

echo "🌱 Seeding database..."

# Admin user — password: Admin@123
# Hash generated via: node -e "const b=require('bcryptjs');b.hash('Admin@123',12).then(h=>console.log(h))"
ADMIN_HASH='$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpwBAM2VEkrGVu'

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<SQL
  INSERT INTO users (id, name, email, password_hash, role, status)
  VALUES
    (uuid_generate_v4(), 'Admin User',   'admin@finance.com',   '$ADMIN_HASH', 'admin',   'active'),
    (uuid_generate_v4(), 'Analyst User', 'analyst@finance.com', '$ADMIN_HASH', 'analyst', 'active'),
    (uuid_generate_v4(), 'Viewer User',  'viewer@finance.com',  '$ADMIN_HASH', 'viewer',  'active')
  ON CONFLICT (email) DO NOTHING;
SQL

echo "✅ Seed complete. Default users:"
echo "   admin@finance.com   / Admin@123 (admin)"
echo "   analyst@finance.com / Admin@123 (analyst)"
echo "   viewer@finance.com  / Admin@123 (viewer)"
