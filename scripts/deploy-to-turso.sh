#!/bin/bash
# ============================================================
# deploy-to-turso.sh
# Automates: Turso DB creation → schema push → data seed
#
# PREREQUISITES:
#   1. Install Turso CLI (already done):
#      export PATH="/home/z/.turso:$PATH"
#   2. Login to Turso (one-time, interactive):
#      turso auth login
#
# USAGE:
#   export PATH="/home/z/.turso:$PATH"
#   bash scripts/deploy-to-turso.sh
# ============================================================

set -euo pipefail

DB_NAME="selrx-pharmacy"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== Step 1: Creating Turso database '$DB_NAME' ==="
if turso db show "$DB_NAME" >/dev/null 2>&1; then
  echo "Database '$DB_NAME' already exists, skipping creation."
else
  turso db create "$DB_NAME" -w 2>&1 || {
    echo "Failed to create database. Make sure you're logged in: turso auth login"
    exit 1
  }
fi

echo ""
echo "=== Step 2: Getting database URL and auth token ==="
DB_URL=$(turso db show "$DB_NAME" --url 2>&1)
AUTH_TOKEN=$(turso db tokens create "$DB_NAME" 2>&1)

echo "DATABASE_URL=$DB_URL"
echo "DATABASE_AUTH_TOKEN=$AUTH_TOKEN"
echo ""

echo "=== Step 3: Pushing Prisma schema to Turso ==="
DATABASE_URL="$DB_URL" \
DATABASE_AUTH_TOKEN="$AUTH_TOKEN" \
npx prisma db push 2>&1

echo ""
echo "=== Step 4: Seeding data into Turso ==="
DATABASE_URL="$DB_URL" \
DATABASE_AUTH_TOKEN="$AUTH_TOKEN" \
npx tsx prisma/seed.mts import 2>&1

echo ""
echo "=== Step 5: Verifying ==="
DATABASE_URL="$DB_URL" \
DATABASE_AUTH_TOKEN="$AUTH_TOKEN" \
npx prisma db execute --stdin <<'SQL'
SELECT 'SystemRole: ' || COUNT(*) FROM SystemRole;
SELECT 'User: ' || COUNT(*) FROM User;
SELECT 'Company: ' || COUNT(*) FROM Company;
SQL

echo ""
echo "============================================================"
echo " SUCCESS! Your Turso database is ready."
echo ""
echo " Set these environment variables on Vercel:"
echo ""
echo "   DATABASE_URL=$DB_URL"
echo "   DATABASE_AUTH_TOKEN=$AUTH_TOKEN"
echo ""
echo " Then deploy via Vercel dashboard or CLI."
echo "============================================================"
