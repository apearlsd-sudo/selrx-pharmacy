#!/bin/bash
# Self-healing Next.js production server
# Restarts automatically if the process dies

cd /home/z/my-project

LOG_FILE="/home/z/my-project/server.log"
PID_FILE="/home/z/my-project/server.pid"

# Kill any existing server
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill -9 "$OLD_PID" 2>/dev/null
  rm -f "$PID_FILE"
fi

pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "next start" 2>/dev/null
sleep 2

echo "[$(date)] Starting self-healing Next.js server..." > "$LOG_FILE"

MAX_RESTARTS=50
RESTART_COUNT=0

while [ $RESTART_COUNT -lt $MAX_RESTARTS ]; do
  echo "[$(date)] === Attempt $((RESTART_COUNT+1))/$MAX_RESTARTS ===" >> "$LOG_FILE"
  
  # Start the production server
  PORT=3000 NODE_ENV=production node_modules/.bin/next start -p 3000 >> "$LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  
  echo "[$(date)] Server started with PID $SERVER_PID" >> "$LOG_FILE"
  
  # Wait for it to be ready
  for i in $(seq 1 15); do
    if curl -s --max-time 2 http://localhost:3000/ -o /dev/null 2>/dev/null; then
      echo "[$(date)] Server is ready (attempt $i)" >> "$LOG_FILE"
      break
    fi
    sleep 1
  done
  
  # Wait for the process to exit
  wait $SERVER_PID
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE" >> "$LOG_FILE"
  
  RESTART_COUNT=$((RESTART_COUNT+1))
  
  # Brief pause before restart
  sleep 2
done

echo "[$(date)] Max restarts reached, giving up" >> "$LOG_FILE"
rm -f "$PID_FILE"
