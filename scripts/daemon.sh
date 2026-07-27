#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=256"
while true; do
  node node_modules/next/dist/bin/next start --port 3000 -H 0.0.0.0 2>&1
  sleep 2
done
