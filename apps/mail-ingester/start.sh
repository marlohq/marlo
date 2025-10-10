#!/bin/bash

NODE_ENV="production"

if [ -n "$AXIOM_TOKEN_INGEST" ]; then
    mkdir -p ./vector/data
    mkdir -p ./vector/logs
    TIMESTAMP=$(date +"%Y%m%d%H%M%S%N")
    
    pnpm --filter @workspace/mail-ingester start >> ./vector/logs/${TIMESTAMP}.json 2>&1 &
    vector --config ./apps/mail-ingester/vector.toml &
    wait
else
    pnpm --filter @workspace/mail-ingester start
fi
