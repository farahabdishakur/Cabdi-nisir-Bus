#!/usr/bin/env bash
# Backup maalinle ah ee database-ka (cron: 0 23 * * * /opt/cabdinasir/scripts/backup.sh)
# - pg_dump (format custom, la cadaadiyay) → BACKUP_DIR
# - kuwa ka weyn KEEP_DAYS waa la tirtiraa
# - haddii OFFSITE_CMD la dejiyo (tusaale: rclone copy … remote:bucket) nuqul meel kale ah ayaa la diraa
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cabdinasir}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/cabdinasir-$STAMP.dump"
# Prisma URL-ka ?schema=public pg_dump ma garanayo
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$FILE"
echo "backup: $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name 'cabdinasir-*.dump' -mtime +"$KEEP_DAYS" -print -exec rm -f {} \;

if [[ -n "${OFFSITE_CMD:-}" ]]; then
  eval "$OFFSITE_CMD \"$FILE\""
fi
