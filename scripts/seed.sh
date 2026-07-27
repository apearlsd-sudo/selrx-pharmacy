#!/bin/bash
# SelRx Database Seed Script
# Usage: ./scripts/seed.sh

set -e

echo "🌱 Seeding SelRx database..."
cd "$(dirname "$0")/.."
bun run scripts/seed.ts
