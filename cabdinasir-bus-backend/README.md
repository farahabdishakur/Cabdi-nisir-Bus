# Cabdinasir Bus — Backend API

API-ga nidaamka diiwaangelinta **rakaabka, kuraasta, alaabta iyo lacagta** ee Cabdinasir Bus (Boorama · Wajaale · Laanta 3aad).

- Frontend: repo gaar ah → `cabdinasir-bus-web`
- Xeerarka repo-ga: [`CLAUDE.md`](CLAUDE.md)
- Xeerarka ganacsiga: [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)
- Warbixinta farsamada & xaaladda: [`docs/REPORT.md`](docs/REPORT.md)

**Stack:** Node 22 · NestJS 11 · TypeScript · PostgreSQL 16 · Prisma 6 · Docker

## Bilaabid (development)
```bash
cp .env.example .env            # beddel secrets-ka
npm install
npx prisma migrate deploy       # tables-ka
SEED_DEMO=true npm run db:seed  # laamaha, noocyada, routes, super admin (+ shaqaale tijaabo)
npm run dev                     # http://localhost:3000/api/v1
```
- API docs (Swagger): http://localhost:3000/api/docs
- Ama Docker: `docker compose up --build` (migrations si automatic ah ayay u socdaan).

### Login-ka tijaabada (SEED_DEMO=true)
| Role | Taleefan | Password |
|---|---|---|
| Super Admin | `SEED_SUPER_ADMIN_PHONE` (.env) | `SEED_SUPER_ADMIN_PASSWORD` |
| Maamulaha Boorama | 0631000001 | Demo1234! |
| Karraani Boorama | 0631000002 | Demo1234! |
| Maamulaha Wajaale | 0632000001 | Demo1234! |
| Karraani Wajaale | 0632000002 | Demo1234! |

## Tests
```bash
npm test             # unit (pricing)
npm run test:e2e     # socodka buuxa — wuxuu u baahan yahay Postgres + .env.test (database: cabdinasir_bus_test)
```
`.env.test` = `.env.example` oo database-ku yahay `cabdinasir_bus_test`. E2E-gu database-kaas wuu nadiifiyaa.
