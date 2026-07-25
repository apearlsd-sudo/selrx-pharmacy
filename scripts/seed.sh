#!/bin/bash
# GAZPharm Database Seed Script
# Usage: ./scripts/seed.sh

set -e

echo "🌱 Seeding GAZPharm database..."
cd "$(dirname "$0")/.."
bun run scripts/seed.ts
