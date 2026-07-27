#!/bin/bash
cd /home/z/my-project
while true; do
  PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js >> /tmp/gazpharm-server.log 2>&1
  echo "Server exited with code $?. Restarting in 1s..." >> /tmp/gazpharm-server.log
  sleep 1
done
