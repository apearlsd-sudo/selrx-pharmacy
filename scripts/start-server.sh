#!/bin/bash
cd /home/z/my-project
PORT=3000 HOSTNAME=0.0.0.0 node node_modules/next/dist/bin/next start --port 3000 -H 0.0.0.0
