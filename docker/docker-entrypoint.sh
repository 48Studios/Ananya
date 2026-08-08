#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "🚀 RUN_MIGRATIONS is set to true. Executing database setup & migrations..."
  pnpm --filter @ananya/database db:setup || {
    echo "❌ Database migrations failed!"
    exit 1
  }
  echo "✅ Database migrations completed successfully."
fi

exec "$@"
