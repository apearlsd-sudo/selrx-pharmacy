#!/bin/bash
# keep-alive dev server wrapper
cd /home/z/my-project
rm -rf .next 2>/dev/null

while true; do
  echo "[$(date)] Starting Next.js dev server..."
  NODE_OPTIONS="--max-old-space-size=256" npx next dev -p 3000 --turbopack 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..."
  sleep 3
  rm -rf .next 2>/dev/null
done
