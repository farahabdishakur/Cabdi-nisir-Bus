# Cabdinasir Bus — Website (Dashboard)

Website-ka shaqaalaha iyo Super Admin-ka Cabdinasir Bus: iibka tigidhada (seat map), ballan taleefan, Zaad/eDahab,
alaab (dir · rar · gaadhay · wareeji), sanduuqa, warbixinada, iyo maamulka.

- Backend: repo gaar ah → `cabdinasir-bus-backend`
- Xeerarka repo-ga: [`CLAUDE.md`](CLAUDE.md) · Naqshadda: [`docs/UI_RULES.md`](docs/UI_RULES.md) · Warbixinta: [`docs/REPORT.md`](docs/REPORT.md)

**Stack:** Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · TanStack Query · Af-Soomaali (default) / English

## Bilaabid (development)
```bash
# 1. Backend-ka ha socdo (port 3000) — eeg cabdinasir-bus-backend/README.md
cp .env.example .env.local      # API_URL=http://localhost:3000
npm install
npm run dev                     # http://localhost:3001
```
Website-ku `/api/v1/*` wuxuu u gudbiyaa backend-ka (Next rewrite) → isla domain-ka → cookie-ga refresh waa same-origin.
Production-ka Caddy ayaa sidaas sameeya (`app.domain/api` → backend).

Login-ka tijaabada (backend `SEED_DEMO=true`): Karraani Boorama 1 `0631000002` / `Demo1234` · Maamulaha `0631000001` / `Demo1234` · Wajaale karraani `0632000002`.

## Tests
```bash
npm test          # unit (lacag/waqti formatting)
npm run lint && npm run typecheck && npm run build
npm run e2e       # browser dhab ah (Playwright) — backend (database demo cusub, THROTTLE_DISABLED=true) + website (port 3001) waa inay socdaan
```
E2E (18 tallaabo): login · fur sanduuqa · iib tigidh + rasiid · ballan taleefan · bixi ballanta Zaad · Zaad mar labaad la diiday ·
alaab dir (COD) + PIN · rar gaariga · calaamadda "Zaad ✓" · manager: barbar dhig Zaad + warbixino + gaarigu baxay ·
Wajaale: gaadhay → PIN khaldan la diiday → wareejin + COD · taleefan (390px) scroll la'aan. Sawirro: `e2e/screenshots/`.

## Production
`Dockerfile` (port 3001). Waxaa la kiciyaa backend-ka `docker-compose.prod.yml` (service `web`, repo-gan oo ku jira `../web`) + Caddy (`APP_DOMAIN`).
