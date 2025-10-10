#!/bin/bash

NODE_ENV="production"

if [ -n "$AXIOM_TOKEN_SYNC" ]; then
    mkdir -p ./vector/data
    mkdir -p ./vector/logs
    TIMESTAMP=$(date +"%Y%m%d%H%M%S%N")
    
    pnpm --filter @workspace/sync start >> ./vector/logs/${TIMESTAMP}.json 2>&1 &
    vector --config ./apps/sync/vector.toml &
    wait
else
    pnpm --filter @workspace/sync start
fi
