#!/bin/bash

NODE_ENV="production"

if [ -n "$AXIOM_TOKEN_WEB" ]; then
    mkdir -p ./vector/data
    mkdir -p ./vector/logs
    TIMESTAMP=$(date +"%Y%m%d%H%M%S%N")
    
    node ./apps/web/dist/server/entry.mjs >> ./vector/logs/${TIMESTAMP}.json 2>&1 &
    vector --config ./apps/web/vector.toml &
    wait
else
    node ./apps/web/dist/server/entry.mjs
fi