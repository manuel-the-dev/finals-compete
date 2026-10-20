#!/usr/bin/env bash
# Full logical backup of the database (schema + data, incl. credentials).
# Usage: DATABASE_URL=... bash scripts/backup.sh [output-dir]
# Produces <dir>/finals-compete-<timestamp>.dump (pg_dump custom format) and a .sha256 checksum.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/finals-compete-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
# Sanity check: the archive must be readable and contain the core tables.
pg_restore --list "$FILE" | grep -q "TABLE public matches" || { echo "Backup unvollständig: Tabelle matches fehlt" >&2; exit 1; }
sha256sum "$FILE" > "$FILE.sha256"
echo "$FILE"
