#!/usr/bin/env bash
# Build command for Vercel (see vercel.json).
# - preview:    apply migrations to the preview database (a Neon branch), then build
# - production: only CHECK migrations; production migrations run via the GitHub workflow "Migrate database"
set -euo pipefail
case "${VERCEL_ENV:-development}" in
  preview)    npx tsx scripts/migrate.ts ;;
  production) npx tsx scripts/check-migrations.ts ;;
esac
npx next build
