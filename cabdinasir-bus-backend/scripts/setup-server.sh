#!/usr/bin/env bash
# =============================================================================
#  Cabdinasir Bus — server cusub (Ubuntu 22.04 / 24.04 VPS) hal amar:
#
#     sudo bash cabdinasir-bus-backend/scripts/setup-server.sh  app.cabdinasirbus.com
#
#  Wuxuu sameeyaa: Docker · firewall (22/80/443) · .env (sirta oo random ah) · database + backend +
#  website + Caddy (HTTPS toos ah) · Super Admin · backup maalinle ah (23:00).
#  Mar labaad haddii la kiciyo (update): wuxuu ilaaliyaa .env-ka iyo xogta — kaliya wuu dhisaa oo kiciyaa.
#
#  Ka hor: domain-ka A record-kiisu ha tilmaamo IP-ga server-ka (DNS), si HTTPS u shaqeeyo.
#  Tijaabo (server la'aan): SKIP_SYSTEM=1 EXTRA_COMPOSE=… bash setup-server.sh localhost
# =============================================================================
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Isticmaal: sudo bash $0 <domain>   (tusaale: cabdinasirbus.com — api.<domain> sidoo kale DNS ku dar)"
  exit 1
fi
DIR="$(cd "$(dirname "$0")/.." && pwd)"   # cabdinasir-bus-backend
cd "$DIR"
COMPOSE=(docker compose -f docker-compose.prod.yml)
if [[ -n "${EXTRA_COMPOSE:-}" ]]; then COMPOSE+=(-f "$EXTRA_COMPOSE"); fi
say() { echo -e "\033[1;36m[cabdinasir]\033[0m $*"; }

# 1. nidaamka (Docker + firewall)
if [[ -z "${SKIP_SYSTEM:-}" ]]; then
  [[ $EUID -eq 0 ]] || { echo "sudo ku kici"; exit 1; }
  if ! command -v docker >/dev/null; then
    say "Docker waa la rakibayaa ..."
    apt-get update -y && apt-get install -y ca-certificates curl
    curl -fsSL https://get.docker.com | sh
  fi
  if command -v ufw >/dev/null; then
    ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
    ufw --force enable >/dev/null
    say "Firewall: 22, 80, 443 kaliya"
  fi
fi

# 2. .env (hal mar — sirta random ah; mar dambe lama beddelo)
SA_PASSWORD=""
if [[ ! -f .env ]]; then
  rnd() { openssl rand -hex "$1"; }
  SA_PASSWORD="Cb-$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 10)9"
  cat > .env <<ENV
# Waxaa sameeyay scripts/setup-server.sh — ha wadaagin (sir)
NODE_ENV=production
APP_DOMAIN=${DOMAIN}
API_DOMAIN=api.${DOMAIN}
CORS_ORIGIN=https://${DOMAIN}
POSTGRES_PASSWORD=$(rnd 24)
JWT_ACCESS_SECRET=$(rnd 32)
JWT_REFRESH_SECRET=$(rnd 32)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7
PORT=3000
TZ_BUSINESS=Africa/Mogadishu
SEED_SUPER_ADMIN_PHONE=0630000000
SEED_SUPER_ADMIN_PASSWORD=${SA_PASSWORD}
SMS_PROVIDER=log
JOBS_ENABLED=true
SWAGGER_ENABLED=false
MEDIA_MAX_VIDEO_MB=40
ENV
  chmod 600 .env
  say ".env waa la sameeyay (sirta random ah)"
else
  say ".env horay ayuu u jiray — waa la ilaaliyay"
fi

# 3. dhis + kici
say "Waa la dhisayaa (markii ugu horreysay 5–10 daqiiqo) ..."
"${COMPOSE[@]}" up -d --build

say "Sugaya backend-ka ..."
for _ in $(seq 1 90); do
  if "${COMPOSE[@]}" exec -T api node -e "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then break; fi
  sleep 3
done

# 4. xogta aasaasiga (laamaha, wadooyinka, noocyada, Super Admin) — mar kasta waa ammaan (upsert)
"${COMPOSE[@]}" exec -T api node dist/prisma/seed.js

# 5. backup maalinle (23:00): database + sawirada/video-yada
if [[ -z "${SKIP_SYSTEM:-}" ]]; then
  mkdir -p /var/backups/cabdinasir
  cat > /usr/local/bin/cabdinasir-backup <<BK
#!/usr/bin/env bash
set -e
cd "$DIR"
STAMP=\$(date +%F)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U cb -Fc cabdinasir_bus > /var/backups/cabdinasir/db-\$STAMP.dump
docker compose -f docker-compose.prod.yml cp api:/data/uploads /var/backups/cabdinasir/uploads-latest >/dev/null 2>&1 || true
find /var/backups/cabdinasir -name 'db-*.dump' -mtime +30 -delete
BK
  chmod 755 /usr/local/bin/cabdinasir-backup
  echo "0 23 * * * root /usr/local/bin/cabdinasir-backup >> /var/log/cabdinasir-backup.log 2>&1" > /etc/cron.d/cabdinasir-backup
  say "Backup: maalin kasta 23:00 → /var/backups/cabdinasir (30 maalmood)"
fi

echo
say "✓ DIYAAR"
echo "   Website:      https://${DOMAIN}"
echo "   Super Admin:  0630000000"
if [[ -n "$SA_PASSWORD" ]]; then
  echo "   Password:     ${SA_PASSWORD}   ← qor oo meel ammaan ah dhig (login-ka koowaad waa la beddelayaa)"
fi
echo "   Cusboonaysiin: git pull  →  sudo bash $0 ${DOMAIN}"
