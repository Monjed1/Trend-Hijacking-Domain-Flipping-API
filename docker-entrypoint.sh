#!/bin/sh
set -e

npx prisma migrate deploy

if [ "$1" = "worker" ]; then
  exec node dist/workers/index.js
fi

exec node dist/server.js
