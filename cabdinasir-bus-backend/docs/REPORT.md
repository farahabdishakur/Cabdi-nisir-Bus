# Warbixinta Backend-ka — Cabdinasir Bus API

**Repo:** `cabdinasir-bus-backend` · **Version:** 0.6.0 · **Xaaladda:** Backend-ka waa dhammaystiran yahay + dib-u-eegis amni madax-bannaan (10 arrimood, dhammaan la saxay) — tijaabiyay · **Taariikh:** 2026-11-24

Dokumentiyada kale: [`BUSINESS_RULES.md`](BUSINESS_RULES.md) (xeerarka ganacsiga) · [`DEPLOYMENT.md`](DEPLOYMENT.md) (internet, server, offline, backup) · Swagger: `/api/docs` · `openapi.json`

---

## 1. Ujeeddada
API keliya oo ay isticmaalaan laamaha oo dhan — **Boorama Laanta 1 (`BO1`), Boorama Laanta 2 (`BO2`), Wajaale (`WAJ`)** — iyo Super Admin.
Labada laamood ee Boorama waxay wadaagaan safarada (seat map, iib, rar alaab); lacagta iyo alaabta laan kasta waa gooni (BUSINESS_RULES §1). Hal database →
laan kasta isla markiiba way aragtaa alaabta loogu soo diray; Super Admin wuxuu arkaa lacagta laamaha oo dhan.

## 2. Architecture
```
[Website (cabdinasir-bus-web)] ──HTTPS──▶ [Caddy] ──▶ [NestJS API] ──▶ [PostgreSQL]
       │  offline: IndexedDB + /sync                     │
       │                                                 ├── Outbox (notifications) ──▶ SMS provider
[Bogga dadweynaha /public/track]                         ├── Cron jobs (SMS, xusuusin, nadiifin)
                                                         └── uploads/ (sawirada alaabta)
```
- Redis/BullMQ looma baahna: SMS-ka waxaa lagu maamulaa **outbox table** + `FOR UPDATE SKIP LOCKED` (fudud, aan lumin).
- Faahfaahinta server-ka, internet-ka laamaha, offline iyo backup → `DEPLOYMENT.md`.

## 3. Modules
| Module | Shaqada |
|---|---|
| `config` | Hubinta `.env` marka la kacayo (production: secrets default ah → diid) |
| `auth` | login, refresh rotation (dib-u-isticmaal → dhammaan xir), logout, logout-all, beddel password, xirid 5 isku day |
| `users` | shaqaalaha; Manager → karraani/darawal laantiisa kaliya |
| `branches` · `routes` · `vehicles` · `drivers` · `parcel-categories` | Xogta aasaasiga (Super Admin) |
| `settings` | qiimaha (fragile, caymis, discount xad, hold, kayd), **profile-ka shirkadda** (rasiidka), sicirka USD⇄SLSH |
| `trips` | jadwal (+bulk), clash check, status machine, seat map, seat hold, manifest, **move-bookings** (gaari xumaaday) |
| `bookings` | iib, discount xad, void + refund, transfer (safar/kursi), reprint, **sixitaan**, board, Idempotency-Key |
| `parcels` | quote, diiwaangelin (PIN), load/unload, arrive, arrive-batch (maqan), deliver (PIN + COD + kayd), void, missing/damaged, sawir, reprint, **sixitaan**, **reset PIN**, history |
| `cash` | payments (Cash/Zaad/eDahab, USD/SLSH), cash sessions (fur, summary, xir + variance, **force-close**, ansixi) |
| `finance` | kharash (expenses) + void · deposits (→ xafiiska guud/bangi) + xaqiijin Super Admin · Idempotency-Key |
| `void-requests` | karraani codsada → manager ansixiya/diida |
| `notifications` | SMS outbox, templates Af-Soomaali, provider (log/http), retry 5 jeer, PIN redaction |
| `jobs` | cron: SMS worker (30s), nadiifin (saacad), xusuusinta alaabta (09:00) |
| `reports` | dashboard, revenue (dakhli/kharash/net), occupancy, parcels, exceptions, inter-branch, daily-close, cashiers, **trips-profit**, CSV |
| `customers` | autofill magacyada taleefanka |
| `public` | tracking alaabta (koodh + 4 god), **jadwalka safarada + kuraasta bannaan**, liiska laamaha |
| `sync` | offline: bootstrap (xogta tixraaca) + parcels batch |
| `audit` | interceptor (ficil kasta) + before/after ficillada xasaasiga + login (guul/fashil) |
| `events` | live updates (SSE) — seat map, alaab, codsiyo void, sanduuqyo; laan kasta tan iyada |

## 4. Database (22 table)
`branches` · `users` · `refresh_tokens` · `routes` · `vehicles` · `drivers` · `trips` · `seat_holds` · `bookings` · `parcel_categories` · `parcels` · `parcel_status_history` · `payments` · `cash_sessions` · `expenses` · `deposits` · `void_requests` · `notifications` · `exchange_rates` · `pricing_settings` · `sequences` · `audit_logs`

Ilaalinta heerka database-ka (code-ka kaliya kuma tiirsana):
- `bookings_active_seat` — partial unique index: hal kursi = hal tigidh firfircoon.
- `void_requests_one_pending` — hal codsi sugaya hal shay kasta.
- Triggers `prevent_delete` — `payments`, `bookings`, `parcels`, `expenses`, `deposits`, `void_requests`, `audit_logs` lama tirtiri karo.
- Lacag = integer (senti / shilin); boqolley = basis points.
- Lambarada rasiidka: `sequences` + `UPDATE … RETURNING` (taxane, gap la'aan).

Schema buuxa: `prisma/schema.prisma`.

## 5. API Endpoints (`/api/v1`) — 97
| Qayb | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/login` `/refresh` `/logout` `/logout-all` `/change-password` · `GET /auth/me` | all |
| Xogta aasaasiga | `GET/POST /branches` `/routes` `/vehicles` `/drivers` `/parcel-categories` · `PATCH /…/:id` | SA (read: staff; drivers: BM) |
| Settings | `GET/PUT /pricing-settings` `/exchange-rates/today` `/company` · `GET /exchange-rates` (taariikh) | read: all (company: public) · write: SA |
| Users | `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | SA, BM |
| Trips | `GET/POST /trips` · `POST /trips/bulk` · `GET/PATCH /trips/:id` · `PATCH /trips/:id/status` · `GET /trips/:id/seats` `/manifest` · `POST/DELETE /trips/:id/seats/:no/hold` · `POST /trips/:id/move-bookings` (BM+) | staff (create: BM+; manifest: +DRIVER) |
| Bookings | `GET/POST /bookings` · **`POST /bookings/reserve`** (ballan taleefan) · **`POST /bookings/:id/confirm`** (bixi) · **`POST /bookings/:id/cancel-reservation`** · `GET/PATCH /bookings/:id` · `POST /bookings/:id/void` (BM+) `/transfer` `/reprint` `/board` | staff |
| Parcels | `POST /parcels/quote` · `GET/POST /parcels` · `GET /parcels/incoming` `/outgoing` `/:code` · `POST /parcels/arrive-batch` · `PATCH /parcels/:id` (sixitaan) · `POST /parcels/:id/load` `/unload` `/arrive` `/deliver` `/reprint` `/reset-pin` · `GET/POST /parcels/:id/photo` · `POST /parcels/:id/void` `/mark-missing` `/mark-damaged` (BM+) | staff |
| Cash | `GET /cash-sessions` `/current` · `POST /cash-sessions/open` `/:id/close` · `/:id/force-close` `/:id/approve` (BM+) | staff |
| Zaad/eDahab | `GET /payments/lookup?method=&reference=` (staff) · `GET /payments/mobile?reconciled=false` · `POST /payments/:id/reconcile` · `POST /payments/reconcile` (BM+) | |
| Finance | `GET/POST /expenses` · `POST /expenses/:id/void` (BM+) · `GET/POST /deposits` · `POST /deposits/:id/confirm` (SA) | staff |
| Void requests | `GET/POST /void-requests` · `POST /void-requests/:id/approve` `/reject` (BM+) | staff |
| Reports | `GET /reports/dashboard` (staff) · `/revenue` `/occupancy` `/parcels` `/exceptions` `/inter-branch` `/daily-close` `/cashiers` `/trips-profit` (`?format=csv`) | BM+ |
| Notifications | `GET /notifications` · `POST /notifications/:id/retry` · `POST /notifications/process` (SA) | BM+ |
| Customers | `GET /customers/lookup?phone=` | staff |
| Sync (offline) | `GET /sync/bootstrap` · `POST /sync/parcels` | staff |
| Health | `GET /health` (public) · `GET /health/details` (SA: DB, SMS sugaya/fashilmay, sanduuqyo furan) | |
| Integrity | `GET /reports/integrity` — lacag/alaab shaki leh (liis madhan = sax) | BM+ |
| Public | `GET /public/track/:code?phone=1234` · `GET /public/trips?date=&from=BOR&to=WAJ` · `GET /public/branches` · `GET /health` | public |
| Live events | `GET /events` (SSE: `SEAT_CHANGED`, `TRIP_STATUS`, `PARCEL_CHANGED`, `VOID_REQUEST`, `CASH_SESSION`, `PING`) | staff |
| Audit | `GET /audit-logs` | BM+ |

Error format: `{ "error": { "code": "SEAT_TAKEN", "message": "…", "details": {} } }` — liiska koodhadhka: §9.

## 6. Amniga
- HTTPS (Caddy) · Helmet · CORS domain-ka website-ka kaliya · request id + log.
- Rate limit 300/daqiiqo; login 5/daqiiqo; public tracking 10/daqiiqo; akoon xir 15 daqiiqo 5 isku day kadib.
- Refresh token: httpOnly cookie, rotation, reuse detection; user la xiro / role la beddelo → tokens waa la burinayaa.
- Passwords & PIN: argon2. PIN-ka SMS-ka laguma hayo kadib dirista. `pickupPinHash` weligiis looma celiyo client-ka.
- **Tokens isla markiiba way dhacaan** (tokenVersion + user status cache 10s): user la xiray, role/laan/password la beddelay, logout-all. Role-ka waxaa laga akhriyaa DB-ga, ma aha token-ka. SSE stream-kuna wuu go'aa (5s).
- **Password ku-meel-gaar ah** → `PASSWORD_CHANGE_REQUIRED` ilaa la beddelo. Password: 8+ xaraf, xaraf + tiro.
- **Login brute force:** 5 isku day (taleefan + IP) → `TOO_MANY_ATTEMPTS` 15 daqiiqo (weeraryahanka kaliya; akoonku ma xirmo) · 20 isku day (IP badan) → akoonka 15 daqiiqo.
- **PIN brute force:** 5 isku day → `PIN_LOCKED` (atomic — requests isku mar ah kama gudbi karaan).
- `TRUST_PROXY` kaliya marka Caddy hor fadhiyo (X-Forwarded-For lama been abuuri karo). Swagger production-ka waa xiran yahay.
- Body limit 2 MB (offline sync). Lacag kasta `@Max` (int4 ammaan).

### Ilaalinta tartanka (race conditions) — lacag laba jeer / lumis
| Halis | Ilaalin |
|---|---|
| Hal kursi laba qof | partial unique index |
| Void laba jeer → celin laba jeer | optimistic lock (`updateMany where status`) + codsiga void qabsasho atomic ah |
| Lacag gasha sanduuq la xirayo | `SELECT … FOR UPDATE` sanduuqa — lacag & xiritaan way is sugaan |
| Kharashyo isku mar → sanduuq taban | isla lock-ga sanduuqa |
| Kharash void laba jeer | `updateMany where voidedAt null` |
| Laba sanduuq furan hal karraani | unique index `cash_sessions_one_open` |
| Refresh token isku mar laba jeer | `updateMany where revokedAt null` → kan labaad = dib-u-isticmaal → dhammaan xir |
| Badhan laba jeer (tigidh/alaab/kharash/deposit) | Idempotency-Key (kaliya isla qofka — laguma soo saari karo xog qof kale) |
- Audit log lama tirtiri karo; ficillada lacageed oo dhan way diiwaangashan yihiin.
- Upload: kaliya JPEG/PNG/WEBP ≤ 5MB; waxaa arki kara laamaha alaabta leh oo keliya.
- CSV export: formula injection waa la difaacay.

## 7. Tests
| Nooc | Tirada | Waxa ay hubiyaan |
|---|---|---|
| Unit | 24 | qiimaynta, taleefannada, CSV, state machines, waqtiga UTC+3, SMS templates, seat layout |
| E2E — `flow` | 14 | maalin buuxa: tigidh → alaab COD → rar → bixitaan → gaadhay → wareejin PIN → xiritaan sanduuq → warbixino; void/refund; **4 qof oo isku mar hal kursi** → 1 guul |
| E2E — `mobile-money` | 11 | lambarka laanta, transaction + diraha waajib, hal mar kaliya (tigidh/alaab, xaraf/meel bannaan), lookup, laba karraani isku mar, SMS ballan + Zaad, `paidVia`, celin Zaad, COD + kayd hal transaction, barbar dhig + laan kale, integrity 48h |
| E2E — `reservations` | 11 | ballan taleefan: sanduuq la'aan, SMS, kursi la qabtay, bixin, xad taleefan, wakhti dhacay (lazy + job), joojin, goor dambe, warbixino/integrity, bixitaan → no-show, safar joojin |
| E2E — `city-security` | 12 | Boorama 2 laamood (wadaag safar, lacag gooni, alaab labada laamood, ARRIVED magaalo), shareTripsWithinCity, token dhac isla markiiba, role DB, password ku-meel-gaar, payload 200 alaab, health/integrity + SMS digniin, PIN brute force |
| E2E — `review-fixes` | 13 | dib-u-eegista amniga: void laba jeer, lacag vs xiritaan sanduuq, kharash isku mar, transfer celin, darawallo laan kale, PIN isku mar, login lockout, refresh isku mar, dashboard, idempotency qof kale, lacag aad u weyn, laba sanduuq, SMS PIN, SSE go'id |
| E2E — `hardening` | 12 | badhan laba jeer (kharash/deposit), sixitaan alaab/tigidh, PIN lumay, gaari xumaaday (move), force-close, faa'iidada safarka, taariikhda sicirka, saacad offline khaldan, jadwal dadweyne, login audit, **live events laan kasta** |
| E2E — `operations` | 16 | company profile, SMS outbox + redaction, landline skip, kharash + void, deposit + xaqiijin, codsi void, transfer + farqi, reprint, tracking dadweyne, autofill, **offline sync idempotent**, sawir, CSV, bulk trips, jobs (nadiifin, xusuusin), logout-all |

`npm test` · `npm run test:e2e` (Postgres + `.env.test`) · CI: `.github/workflows/ci.yml` (GitHub Actions, push kasta).

## 8. Go'aamo
- **NestJS 11 + Prisma 6** (versions la hubo).
- Tigidhka waxaa iibiya **laanta laga baxayo**; alaabta waxaa xaqiijiya (arrive/deliver) **laanta loo diray**.
- Lacag celinta waxay ka baxdaa sanduuqa qofka void-ka sameeyay (Manager) — waa inuu sanduuq furan haystaa.
- **Offline:** alaab kaliya. Tigidh / wareejin / void → online kaliya (DEPLOYMENT §4).
- SMS outbox DB-ga ku jira (Redis la'aan) — server yar, dayactir yar.
- Live events: in-memory (hal server). Server badan → Postgres LISTEN/NOTIFY (`events.service.ts` kaliya).
- Events waxaa la diraa kadib marka request-ku guulaysto (transaction dhammaaday) — `@EmitEvent` interceptor.
- Laamaha: `BO1`, `BO2` (Boorama), `WAJ`. Route/alaab BO1⇄BO2 lama oggola (isku magaalo). Qiimayaasha seed-ka waa tusaale.

## 9. Error Codes (frontend-ku wuu turjumaa)
`VALIDATION_ERROR` `UNAUTHORIZED` `FORBIDDEN` `FORBIDDEN_BRANCH` `NOT_FOUND` `DUPLICATE` `TOO_MANY_REQUESTS` ·
`BRANCH_REQUIRED` `SAME_BRANCH` `INVALID_STATUS_TRANSITION` `CONCURRENT_UPDATE` ·
`SEAT_TAKEN` `SEAT_HELD` `SEAT_NOT_FOUND` `TRIP_CLOSED_FOR_SALE` `TRIP_DEPARTED` `TRIP_LOCKED` `TRIP_HAS_BOOKINGS` `SCHEDULE_CLASH` `SEATS_NOT_IN_VEHICLE` `TRIP_ROUTE_MISMATCH` `REASON_REQUIRED` `ROUTE_INACTIVE` `VEHICLE_INACTIVE` `DRIVER_INACTIVE` `INVALID_SEAT_LAYOUT` ·
`DISCOUNT_TOO_HIGH` `BOOKING_NOT_ACTIVE` ·
`ROUTE_NOT_FOUND` `CATEGORY_NOT_FOUND` `PARCEL_PROHIBITED` `DECLARED_VALUE_REQUIRED` `PAYMENT_REQUIRED` `INVALID_PIN` `PARCEL_NOT_ON_TRIP` `FILE_REQUIRED` `INVALID_FILE_TYPE` ·
`NO_OPEN_SESSION` `SESSION_ALREADY_OPEN` `SESSION_CLOSED` `SESSION_OPEN` `SESSION_APPROVED` `REFERENCE_REQUIRED` `NO_EXCHANGE_RATE` `INSUFFICIENT_CASH` `ALREADY_VOIDED` `ALREADY_CONFIRMED` ·
`REQUEST_PENDING` `REQUEST_DECIDED` `NOT_FAILED` · `MOBILE_REFERENCE_USED` `PAYER_PHONE_REQUIRED` `NOT_MOBILE_PAYMENT` · `RESERVATION_CLOSED` `RESERVATION_EXPIRED` `RESERVATION_LIMIT` `RESERVATIONS_DISABLED` · `SAME_CITY` `SESSION_REVOKED` `PASSWORD_CHANGE_REQUIRED` `SAME_PASSWORD` `TOO_MANY_ATTEMPTS` `PIN_LOCKED` `PIN_SMS_EXPIRED` `IDEMPOTENCY_KEY_REUSED` `NOT_A_DRIVER_ACCOUNT` · `PARCEL_CLOSED` `NOTHING_TO_CHANGE` `NOT_ENOUGH_SEATS` `SAME_TRIP` `USE_NORMAL_CLOSE` `OFFLINE_TIME_INVALID` · `WRONG_PASSWORD` `CANNOT_DEACTIVATE_SELF` `INVALID_IDEMPOTENCY_KEY`

## 10. Waxa Weli Furan (aan code ahayn)
| Shay | Cidda | Xaalad |
|---|---|---|
| ~~Laanta 3aad~~ → Boorama Laanta 2 | Mulkiilaha | ✅ |
| Taleefannada Boorama Laanta 2 | Mulkiilaha | ❓ |
| Qiimayaasha dhabta ah (tigidh, kg, min fee, fragile, caymis, kayd) | Mulkiilaha | ❓ |
| Tirada kuraasta / qaabka gaari kasta | Mulkiilaha | ❓ (default Hiace 14) |
| SMS provider + API-giisa (URL, token, qaabka) | Mulkiilaha → provider | ❓ — `sms.provider.ts` ayaa la waafajin doonaa |
| Domain + VPS | Mulkiilaha | ❓ |
| Zaad/eDahab: transaction + lambarka laga soo diray, hal mar kaliya, barbar dhig maalinle | — | ✅ v0.6.0 |
| Lambarada Zaad/eDahab ee laan kasta | Mulkiilaha | ❓ (Admin → Laamaha) |
| Zaad/eDahab API (xaqiijin automatic, la'aanta gacanta) | Mustaqbal | ⏳ marka Telesom/Somtel API la helo |
| Alaab aan la qaadin muddo dheer → dib ugu celin diraha (return flow) | Mulkiilaha (siyaasad) | ❓ Hadda: xusuusin + khidmad kayd |
| Ballan tigidh taleefan | Mulkiilaha | ✅ v0.5.0 — lacag la'aan, ilaa 60 daqiiqo ka hor bixitaanka (BUSINESS_RULES §24) |
| Online booking (macmiilku laftiisa) | Mustaqbal | ⏳ Waxay isticmaali doontaa isla nidaamka ballanta |
| Dockerfile build | — | Sandbox-ka lama tijaabin karin (Docker Hub rate limit + proxy); server dhab ah ku tijaabi |

## 11. Changelog
- **2026-11-24** — Naqshadda iyo xeerarka.
- **2026-11-24** — v0.1.0: Phase 1 core (auth, trips, seats, bookings, parcels, cash, reports, audit) + 24 tests.
- **2026-11-24** — v0.2.0: dhammaystir backend — kharash, deposits, codsiyada void, transfer, reprint, sawirada alaabta, SMS outbox + jobs, tracking dadweyne, autofill, offline sync, daily-close, cashier report, CSV, company profile, bulk trips, logout-all, env validation, request logging, graceful shutdown, Caddy + docker-compose.prod, backup/restore scripts, openapi export, DEPLOYMENT.md. Tests: 24 unit + 30 e2e.
- **2026-11-24** — v0.3.0: idempotency kharash/deposit, sixitaan alaab & tigidh, reset PIN, move-bookings (gaari xumaaday), force-close sanduuq, trips-profit, taariikhda sicirka, jadwal dadweyne, live events (SSE), login audit, hubinta saacadda offline, CI (GitHub Actions). Tests: 24 unit + 42 e2e.
- **2026-11-24** — v0.4.0: Boorama 2 laamood (wadaagga safarada magaalada), tokens dhac isla markiiba, password ku-meel-gaar ah, login/PIN brute-force, health details, integrity + SMS digniin subax kasta, body 2MB, Swagger off production · **dib-u-eegis amni madax-bannaan**: 10 arrimood (void laba jeer, lacag sanduuq xiran, kharash isku mar, transfer celin, darawallo laan kale, PIN race, login DoS + trust proxy, refresh race, dashboard karraani, SSE/idempotency/lacag xad/SMS retry/laba sanduuq) — dhammaan la saxay + regression tests. Tests: 24 unit + 67 e2e.
- **2026-11-24** — v0.5.0: **ballan taleefan** (RESERVED → CONFIRMED / EXPIRED): kursi lacag la'aan ah ilaa 60 daqiiqo ka hor bixitaanka, SMS, xad 4 taleefan kasta, job daqiiqad kasta, seat map `RESERVED`, warbixinada = tigidh la bixiyay kaliya. Tests: 24 unit + 78 e2e.
- **2026-11-25** — v0.6.0: **Zaad/eDahab**: lambarka laan kasta, lambarka laga soo diray (waajib), hal transaction = hal lacag (DB index + lookup), calaamadda habka lacagta (`paidVia`), barbar dhigga maalinlaha ah (reconcile) + integrity 48h, SMS ballanta oo leh lambarka Zaad. Tests: 24 unit + 89 e2e.
- **2026-11-25** — Fix: `npm run build` mar labaad wax ma soo saarin (Nest `deleteOutDir` + TypeScript incremental cache) → `tsconfig.build.json` `incremental: false`. Caddy: `APP_DOMAIN` (website + /api isla domain), SSE gzip la'aan; `docker-compose.prod.yml` + service `web`.
- **2026-11-25** — `GET /cash-sessions?open=true`: sanduuqyada weli furan (taariikh kasta) — maamuluhu wuu xiri karaa sanduuq karraani ka tagay maalin hore (hore liiska maanta kaliya ayuu ahaa).
- **2026-11-25** — v0.7.0: **Xisaabaadka (CashBook)**: buugga laanta oo toos ah (4 akoon, haraaga socda, CSV), buugga xafiiska guud (wareejimo + qoraallo gacan, sawir biil, void), **P&L** (accrual, baabuur kasta), **mushaharka darawallada** (4 qaab, kasbasho toos ah marka safarku gaadho, mushahar bil cron, advance/bixin/goyn/abaalmarin, bayaan haraaga socda), sawirka biilka kharashka. 114 endpoints. Tests: 24 unit + 98 e2e.
