#!/bin/bash
# SelRx Server — persistent auto-restart wrapper
# Usage: bash scripts/start-server.sh
cd /home/z/my-project

PORT=3000
LOG="/tmp/selrx-server.log"

echo "[$(date)] SelRx server starting on port $PORT..." | tee -a "$LOG"

while true; do
  node node_modules/next/dist/bin/next start --port $PORT -H 0.0.0.0 >> "$LOG" 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 2s..." >> "$LOG"
  sleep 2
done
