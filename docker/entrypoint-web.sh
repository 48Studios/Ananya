#!/bin/sh
set -e

if [ -z "$API_PUBLIC_URL" ]; then
  echo "❌ ERROR: API_PUBLIC_URL environment variable is required but not set!" >&2
  echo "Please provide API_PUBLIC_URL (e.g. API_PUBLIC_URL=https://api.erp.example.com) when starting the container." >&2
  exit 1
fi

echo "🚀 Generating runtime configuration at /app/apps/web/public/runtime-config.js..."
mkdir -p /app/apps/web/public

cat <<EOF > /app/apps/web/public/runtime-config.js
window.__ANANYA_CONFIG__ = {
  apiUrl: "$API_PUBLIC_URL"
};
EOF

echo "✅ Runtime configuration generated successfully (apiUrl: $API_PUBLIC_URL)."
exec "$@"
