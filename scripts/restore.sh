#!/usr/bin/env bash
# Restores a pg_dump archive into the database at TARGET_DATABASE_URL.
# Usage: TARGET_DATABASE_URL=... bash scripts/restore.sh path/to/file.dump [--i-know-this-is-production]
# The target should be an empty database. Existing objects are dropped (--clean) only if they exist.
set -euo pipefail
FILE="${1:?Pfad zum .dump fehlt}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL must be set (bewusst nicht DATABASE_URL, um Verwechslungen zu vermeiden)}"
if [[ "${APP_ENV:-}" == "production" && "${2:-}" != "--i-know-this-is-production" ]]; then
  echo "Abbruch: APP_ENV=production. Mit --i-know-this-is-production bestätigen." >&2
  exit 1
fi
if [[ -f "$FILE.sha256" ]]; then sha256sum --check "$FILE.sha256"; fi
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$FILE"
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT 'matches=' || count(*) FROM matches; SELECT 'users=' || count(*) FROM users;"
echo "Wiederherstellung abgeschlossen."
