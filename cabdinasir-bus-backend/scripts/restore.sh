#!/usr/bin/env bash
# Soo celinta backup: ./scripts/restore.sh /var/backups/cabdinasir/cabdinasir-YYYYMMDD-HHMMSS.dump
# ⚠️ Database-ka hadda jira waa la beddelayaa. Ka hor: jooji API-ga.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
FILE="${1:?usage: restore.sh <file.dump>}"
read -r -p "Database-ka waa la beddeli doonaa. Qor HAA si aad u sii wadato: " ok
[[ "$ok" == "HAA" ]] || { echo "La joojiyay."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="${DATABASE_URL%%\?*}" "$FILE"
echo "Restored from $FILE"
