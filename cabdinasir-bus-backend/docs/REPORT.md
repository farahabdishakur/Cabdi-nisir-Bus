# Warbixinta Backend-ka — Cabdinasir Bus API

**Repo:** `cabdinasir-bus-backend` · **Version:** 0.2.0 · **Xaaladda:** Backend-ka waa dhammaystiran yahay (online + offline sync + SMS + jobs) — tijaabiyay · **Taariikh:** 2026-11-24

Dokumentiyada kale: [`BUSINESS_RULES.md`](BUSINESS_RULES.md) (xeerarka ganacsiga) · [`DEPLOYMENT.md`](DEPLOYMENT.md) (internet, server, offline, backup) · Swagger: `/api/docs` · `openapi.json`

---

## 1. Ujeeddada
API keliya oo ay isticmaalaan laamaha oo dhan (Boorama, Wajaale, Laanta 3aad) iyo Super Admin. Hal database →
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
| `trips` | jadwal (+bulk), clash check, status machine, seat map, seat hold, manifest |
| `bookings` | iib, discount xad, void + refund, **transfer** (safar/kursi), **reprint**, board, Idempotency-Key |
| `parcels` | quote, diiwaangelin (PIN), load/unload, arrive, arrive-batch (maqan), deliver (PIN + COD + kayd), void, missing/damaged, **sawir**, reprint, history |
| `cash` | payments (Cash/Zaad/eDahab, USD/SLSH), cash sessions (fur, summary, xir + variance, ansixi) |
| `finance` | **kharash** (expenses) + void · **deposits** (→ xafiiska guud/bangi) + xaqiijin Super Admin |
| `void-requests` | karraani codsada → manager ansixiya/diida |
| `notifications` | SMS outbox, templates Af-Soomaali, provider (log/http), retry 5 jeer, PIN redaction |
| `jobs` | cron: SMS worker (30s), nadiifin (saacad), xusuusinta alaabta (09:00) |
| `reports` | dashboard, revenue (dakhli/kharash/net), occupancy, parcels, exceptions, inter-branch, **daily-close**, **cashiers**, CSV |
| `customers` | autofill magacyada taleefanka |
| `public` | tracking alaabta (koodh + 4 god), liiska laamaha |
| `sync` | offline: bootstrap (xogta tixraaca) + parcels batch |
| `audit` | interceptor (ficil kasta) + before/after ficillada xasaasiga |

## 4. Database (22 table)
`branches` · `users` · `refresh_tokens` · `routes` · `vehicles` · `drivers` · `trips` · `seat_holds` · `bookings` · `parcel_categories` · `parcels` · `parcel_status_history` · `payments` · `cash_sessions` · `expenses` · `deposits` · `void_requests` · `notifications` · `exchange_rates` · `pricing_settings` · `sequences` · `audit_logs`

Ilaalinta heerka database-ka (code-ka kaliya kuma tiirsana):
- `bookings_active_seat` — partial unique index: hal kursi = hal tigidh firfircoon.
- `void_requests_one_pending` — hal codsi sugaya hal shay kasta.
- Triggers `prevent_delete` — `payments`, `bookings`, `parcels`, `expenses`, `deposits`, `void_requests`, `audit_logs` lama tirtiri karo.
- Lacag = integer (senti / shilin); boqolley = basis points.
- Lambarada rasiidka: `sequences` + `UPDATE … RETURNING` (taxane, gap la'aan).

Schema buuxa: `prisma/schema.prisma`.

## 5. API Endpoints (`/api/v1`) — 80
| Qayb | Endpoints | Roles |
|---|---|---|
| Auth | `POST /auth/login` `/refresh` `/logout` `/logout-all` `/change-password` · `GET /auth/me` | all |
| Xogta aasaasiga | `GET/POST /branches` `/routes` `/vehicles` `/drivers` `/parcel-categories` · `PATCH /…/:id` | SA (read: staff; drivers: BM) |
| Settings | `GET/PUT /pricing-settings` `/exchange-rates/today` `/company` | read: all (company: public) · write: SA |
| Users | `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | SA, BM |
| Trips | `GET/POST /trips` · `POST /trips/bulk` · `GET/PATCH /trips/:id` · `PATCH /trips/:id/status` · `GET /trips/:id/seats` `/manifest` · `POST/DELETE /trips/:id/seats/:no/hold` | staff (create: BM+; manifest: +DRIVER) |
| Bookings | `GET/POST /bookings` · `GET /bookings/:id` · `POST /bookings/:id/void` (BM+) `/transfer` `/reprint` `/board` | staff |
| Parcels | `POST /parcels/quote` · `GET/POST /parcels` · `GET /parcels/incoming` `/outgoing` `/:code` · `POST /parcels/arrive-batch` · `POST /parcels/:id/load` `/unload` `/arrive` `/deliver` `/reprint` · `GET/POST /parcels/:id/photo` · `POST /parcels/:id/void` `/mark-missing` `/mark-damaged` (BM+) | staff |
| Cash | `GET /cash-sessions` `/current` · `POST /cash-sessions/open` `/:id/close` `/:id/approve` (BM+) | staff |
| Finance | `GET/POST /expenses` · `POST /expenses/:id/void` (BM+) · `GET/POST /deposits` · `POST /deposits/:id/confirm` (SA) | staff |
| Void requests | `GET/POST /void-requests` · `POST /void-requests/:id/approve` `/reject` (BM+) | staff |
| Reports | `GET /reports/dashboard` (staff) · `/revenue` `/occupancy` `/parcels` `/exceptions` `/inter-branch` `/daily-close` `/cashiers` (`?format=csv`) | BM+ |
| Notifications | `GET /notifications` · `POST /notifications/:id/retry` · `POST /notifications/process` (SA) | BM+ |
| Customers | `GET /customers/lookup?phone=` | staff |
| Sync (offline) | `GET /sync/bootstrap` · `POST /sync/parcels` | staff |
| Public | `GET /public/track/:code?phone=1234` · `GET /public/branches` · `GET /health` | public |
| Audit | `GET /audit-logs` | BM+ |

Error format: `{ "error": { "code": "SEAT_TAKEN", "message": "…", "details": {} } }` — liiska koodhadhka: §9.

## 6. Amniga
- HTTPS (Caddy) · Helmet · CORS domain-ka website-ka kaliya · request id + log.
- Rate limit 300/daqiiqo; login 5/daqiiqo; public tracking 10/daqiiqo; akoon xir 15 daqiiqo 5 isku day kadib.
- Refresh token: httpOnly cookie, rotation, reuse detection; user la xiro / role la beddelo → tokens waa la burinayaa.
- Passwords & PIN: argon2. PIN-ka SMS-ka laguma hayo kadib dirista. `pickupPinHash` weligiis looma celiyo client-ka.
- Audit log lama tirtiri karo; ficillada lacageed oo dhan way diiwaangashan yihiin.
- Upload: kaliya JPEG/PNG/WEBP ≤ 5MB; waxaa arki kara laamaha alaabta leh oo keliya.
- CSV export: formula injection waa la difaacay.

## 7. Tests
| Nooc | Tirada | Waxa ay hubiyaan |
|---|---|---|
| Unit | 24 | qiimaynta, taleefannada, CSV, state machines, waqtiga UTC+3, SMS templates, seat layout |
| E2E — `flow` | 14 | maalin buuxa: tigidh → alaab COD → rar → bixitaan → gaadhay → wareejin PIN → xiritaan sanduuq → warbixino; void/refund; **4 qof oo isku mar hal kursi** → 1 guul |
| E2E — `operations` | 16 | company profile, SMS outbox + redaction, landline skip, kharash + void, deposit + xaqiijin, codsi void, transfer + farqi, reprint, tracking dadweyne, autofill, **offline sync idempotent**, sawir, CSV, bulk trips, jobs (nadiifin, xusuusin), logout-all |

`npm test` · `npm run test:e2e` (Postgres + `.env.test`).

## 8. Go'aamo
- **NestJS 11 + Prisma 6** (versions la hubo).
- Tigidhka waxaa iibiya **laanta laga baxayo**; alaabta waxaa xaqiijiya (arrive/deliver) **laanta loo diray**.
- Lacag celinta waxay ka baxdaa sanduuqa qofka void-ka sameeyay (Manager) — waa inuu sanduuq furan haystaa.
- **Offline:** alaab kaliya. Tigidh / wareejin / void → online kaliya (DEPLOYMENT §4).
- SMS outbox DB-ga ku jira (Redis la'aan) — server yar, dayactir yar.
- Laanta 3aad: koodh ku-meel-gaar ah `LS3`; qiimayaasha seed-ka waa tusaale.

## 9. Error Codes (frontend-ku wuu turjumaa)
`VALIDATION_ERROR` `UNAUTHORIZED` `FORBIDDEN` `FORBIDDEN_BRANCH` `NOT_FOUND` `DUPLICATE` `TOO_MANY_REQUESTS` ·
`BRANCH_REQUIRED` `SAME_BRANCH` `INVALID_STATUS_TRANSITION` `CONCURRENT_UPDATE` ·
`SEAT_TAKEN` `SEAT_HELD` `SEAT_NOT_FOUND` `TRIP_CLOSED_FOR_SALE` `TRIP_DEPARTED` `TRIP_LOCKED` `TRIP_HAS_BOOKINGS` `SCHEDULE_CLASH` `SEATS_NOT_IN_VEHICLE` `TRIP_ROUTE_MISMATCH` `REASON_REQUIRED` `ROUTE_INACTIVE` `VEHICLE_INACTIVE` `DRIVER_INACTIVE` `INVALID_SEAT_LAYOUT` ·
`DISCOUNT_TOO_HIGH` `BOOKING_NOT_ACTIVE` ·
`ROUTE_NOT_FOUND` `CATEGORY_NOT_FOUND` `PARCEL_PROHIBITED` `DECLARED_VALUE_REQUIRED` `PAYMENT_REQUIRED` `INVALID_PIN` `PARCEL_NOT_ON_TRIP` `FILE_REQUIRED` `INVALID_FILE_TYPE` ·
`NO_OPEN_SESSION` `SESSION_ALREADY_OPEN` `SESSION_CLOSED` `SESSION_OPEN` `SESSION_APPROVED` `REFERENCE_REQUIRED` `NO_EXCHANGE_RATE` `INSUFFICIENT_CASH` `ALREADY_VOIDED` `ALREADY_CONFIRMED` ·
`REQUEST_PENDING` `REQUEST_DECIDED` `NOT_FAILED` · `WRONG_PASSWORD` `CANNOT_DEACTIVATE_SELF` `INVALID_IDEMPOTENCY_KEY`

## 10. Waxa Weli Furan (aan code ahayn)
| Shay | Cidda | Xaalad |
|---|---|---|
| Magaca Laanta 3aad + routes-ka saxda ah | Mulkiilaha | ❓ |
| Qiimayaasha dhabta ah (tigidh, kg, min fee, fragile, caymis, kayd) | Mulkiilaha | ❓ |
| Tirada kuraasta / qaabka gaari kasta | Mulkiilaha | ❓ (default Hiace 14) |
| SMS provider + API-giisa (URL, token, qaabka) | Mulkiilaha → provider | ❓ — `sms.provider.ts` ayaa la waafajin doonaa |
| Domain + VPS | Mulkiilaha | ❓ |
| Zaad/eDahab API (xaqiijin automatic) | Mustaqbal | Hadda: reference gacanta lagu qoro |
| Dockerfile build | — | Sandbox-ka lama tijaabin karin (Docker Hub rate limit + proxy); server dhab ah ku tijaabi |

## 11. Changelog
- **2026-11-24** — Naqshadda iyo xeerarka.
- **2026-11-24** — v0.1.0: Phase 1 core (auth, trips, seats, bookings, parcels, cash, reports, audit) + 24 tests.
- **2026-11-24** — v0.2.0: dhammaystir backend — kharash, deposits, codsiyada void, transfer, reprint, sawirada alaabta, SMS outbox + jobs, tracking dadweyne, autofill, offline sync, daily-close, cashier report, CSV, company profile, bulk trips, logout-all, env validation, request logging, graceful shutdown, Caddy + docker-compose.prod, backup/restore scripts, openapi export, DEPLOYMENT.md. Tests: 24 unit + 30 e2e.
