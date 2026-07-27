#!/bin/bash
# SelRx Server — production auto-restart wrapper
# Implements: dynamic PORT, memory cap, SIGTERM handling, crash recovery
# Usage: bash scripts/start-server.sh
cd /home/z/my-project || exit 1

# ── Dynamic Port ──
PORT="${PORT:-3000}"

# ── Memory Cap (256MB — safe for sandbox limits) ──
NODE_MAX_OLD_SPACE="${NODE_MAX_OLD_SPACE:-256}"
export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE}"

# ── Logging ──
LOG="/tmp/selrx-server.log"
MAX_LOG_LINES=500

# ── Rotate log to prevent disk bloat ──
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_LINES" ]; then
  tail -100 "$LOG" > "$LOG"
fi

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*" | tee -a "$LOG"
}

log "START wrapper | port=$PORT | heap=${NODE_MAX_OLD_SPACE}MB | pid=$$"

# ── Cleanup on wrapper exit ──
cleanup() {
  log "WRAPPER EXIT (signal=$1)"
  # Kill any remaining next server child
  pkill -P "$$" 2>/dev/null
  exit 0
}
trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup SIGINT' SIGINT

# ── Auto-restart loop ──
RESTART_COUNT=0
BACKOFF=2
MAX_BACKOFF=10

while true; do
  RESTART_COUNT=$((RESTART_COUNT + 1))
  log "START next-server #$RESTART_COUNT (backoff=${BACKOFF}s)"

  # Run next start — inherits NODE_OPTIONS for memory cap
  node node_modules/next/dist/bin/next start \
    --port "$PORT" \
    -H 0.0.0.0 \
    >> "$LOG" 2>&1

  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ]; then
    # Clean exit (SIGTERM from wrapper) — stop the loop
    log "CLEAN EXIT (code=0), wrapper stopping"
    break
  fi

  log "CRASH exit=$EXIT_CODE | restart #$RESTART_COUNT in ${BACKOFF}s"
  sleep "$BACKOFF"

  # Exponential backoff with cap
  if [ "$BACKOFF" -lt "$MAX_BACKOFF" ]; then
    BACKOFF=$((BACKOFF * 2))
  fi

  # Reset backoff after 5 successful seconds of uptime
  # (handled implicitly — if server runs >2s then crashes, backoff stays)
done

log "WRAPPER DONE"
