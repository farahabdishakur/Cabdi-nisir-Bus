#!/usr/bin/env bash
# Cabdinasir Bus — tijaabo (Mac / Linux). Joojin: docker compose -f docker-compose.demo.yml down
set -e
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker Desktop rakib: https://www.docker.com/products/docker-desktop/"; exit 1; }
docker compose -f docker-compose.demo.yml up -d --build
echo "Sugaya backend-ka ..."
until curl -s -o /dev/null http://localhost:3000/api/v1/health; do sleep 3; done
cat <<'TXT'

  Website:  http://localhost:3001
  Backend:  http://localhost:3000/api/docs

  Super Admin:  0630000000 / ChangeMe123!  (password cusub ayaa la weydiinayaa)
  Maamule:      0631000001 / Demo1234
  Karraani:     0631000002 / Demo1234
  Wajaale:      0632000001 (maamule) / 0632000002 (karraani) — Demo1234
TXT
(command -v open >/dev/null && open http://localhost:3001) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3001) || true
