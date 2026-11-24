# Warbixinta Backend-ka — Cabdinasir Bus API

**Repo:** `cabdinasir-bus-backend` · **Xaaladda:** Naqshad (code wali lama bilaabin) · **Taariikh:** 2026-11-24

---

## 1. Ujeeddada
API keliya oo ay isticmaalaan dhammaan laamaha (Boorama, Wajaale, Laanta 3aad) iyo Super Admin.
Hal database → laan kasta isla markiiba way aragtaa alaabta loogu soo diray, Super Admin-na wuxuu arkaa lacagta laamaha oo dhan.

## 2. Architecture
```
[cabdinasir-bus-web]  ──HTTPS/JSON──▶  [NestJS API]  ──▶  [PostgreSQL]
                                           │
                                           ├──▶ [Redis + BullMQ]  → SMS, digniino
                                           └──▶ [Object storage]  → sawirada alaabta
```
- Deploy: hal VPS (Docker Compose: api, postgres, redis, caddy/nginx HTTPS).
- Backup: `pg_dump` maalin kasta + nuqul meel kale ah (off-site), 30 maalmood la hayo.

## 3. Modules
| Module | Shaqada |
|---|---|
| `auth` | login (phone/username + password), refresh, logout, beddel password |
| `users` | shaqaalaha, roles, laanta, xirid (deactivate) |
| `branches` | laamaha + taleefannada |
| `routes` | A→B, qiimaha tigidhka, qiimaha kg, min fee |
| `vehicles` | taarikada, seat_layout (JSON), active |
| `drivers` | darawallada (+ user account ikhtiyaari) |
| `trips` | jadwalka, status, seat map, manifest |
| `bookings` | iibka tigidhada, seat hold, void/refund |
| `parcels` | diiwaangelin, quote, load, arrive, deliver, missing/damaged, tracking |
| `pricing` | xisaabinta oo keliya (pure functions + config) |
| `payments` | lacag kasta, method, currency |
| `cash-sessions` | fur/xir sanduuqa, variance, ansixin |
| `exchange-rates` | USD⇄SLSH maalinle |
| `reports` | dakhli, occupancy, alaab, exceptions, inter-branch |
| `audit` | interceptor + query |
| `notifications` | SMS queue (Phase 2) |
| `public` | tracking alaabta (koodh + 4 god taleefan) — Phase 3 |

## 4. Database Schema (kooban)
```
branches(id, code[BOR|WAJ|..], name, city, phones[], is_active)
users(id, name, phone UNIQUE, password_hash, role, branch_id NULL→super admin, is_active, last_login_at)
routes(id, from_branch_id, to_branch_id, ticket_price_cents, front_seat_surcharge_cents,
       parcel_per_kg_cents, parcel_min_fee_cents, is_active)  UNIQUE(from,to)
vehicles(id, plate UNIQUE, model, seat_layout JSONB, capacity, is_active)
drivers(id, name, phone, license_no, user_id NULL, is_active)
trips(id, route_id, vehicle_id, driver_id, departure_at, status, created_by, manifest_locked_at)
seat_holds(trip_id, seat_no, user_id, expires_at)  PK(trip_id, seat_no)
bookings(id, receipt_no UNIQUE, trip_id, seat_no, passenger_name, passenger_phone,
         price_cents, discount_cents, price_breakdown JSONB, status, sold_by, branch_id,
         void_reason, voided_by, created_at)
         UNIQUE(trip_id, seat_no) WHERE status <> 'VOIDED'
parcel_categories(id, name_so, name_en, base_fee_cents, per_kg_multiplier, is_prohibited, is_active)
parcels(id, tracking_code UNIQUE, receipt_no UNIQUE, from_branch_id, to_branch_id, trip_id NULL,
        sender_name, sender_phone, receiver_name, receiver_phone, pickup_pin_hash,
        category_id, pieces, weight_kg NUMERIC(6,2), description, declared_value_cents,
        is_fragile, insured, packaging_ok, payer[SENDER|RECEIVER],
        fee_cents, price_breakdown JSONB, paid_at NULL, status,
        registered_by, delivered_by, delivered_to_name, delivered_at, photo_url, created_at)
parcel_status_history(id, parcel_id, from_status, to_status, branch_id, user_id, note, created_at)
payments(id, kind[TICKET|PARCEL|REFUND|STORAGE], booking_id, parcel_id, method, currency,
         amount, amount_usd_cents, exchange_rate, reference, cashier_id, cash_session_id,
         branch_id, idempotency_key UNIQUE, created_at)
cash_sessions(id, cashier_id, branch_id, opened_at, closed_at, opening_float JSONB,
              expected JSONB, counted JSONB, variance JSONB, approved_by, approved_at, note)
exchange_rates(date, usd_to_slsh, set_by)  PK(date)
pricing_settings(key, value)   -- fragile_surcharge, insurance_pct, max_discount_pct, uncollected_days...
sequences(branch_id, kind, next_value)  PK(branch_id, kind)
audit_logs(id, user_id, branch_id, action, entity, entity_id, before JSONB, after JSONB, ip, created_at)
```
Indexes muhiim ah: `parcels(to_branch_id, status)`, `parcels(tracking_code)`, `parcels(receiver_phone)`, `trips(departure_at)`, `payments(cash_session_id)`.

## 5. API Endpoints (`/api/v1`)
| Method | Path | Role |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | all |
| GET | `/me` | all |
| CRUD | `/branches` `/routes` `/vehicles` `/parcel-categories` `/pricing-settings` | SA (read: all) |
| CRUD | `/users` | SA, BM (laantiisa) |
| CRUD | `/drivers` | SA, BM |
| GET/POST | `/trips` · PATCH `/trips/:id/status` | SA, BM (read: CASHIER) |
| GET | `/trips/:id/seats` · `/trips/:id/manifest` | SA, BM, CASHIER, DRIVER(kiisa) |
| POST/DELETE | `/trips/:id/seats/:no/hold` | CASHIER+ |
| POST | `/bookings` · `/bookings/:id/void` · `/bookings/:id/board` | CASHIER+ / BM+ |
| POST | `/parcels/quote` | CASHIER+ |
| POST | `/parcels` · GET `/parcels` · GET `/parcels/:code` | CASHIER+ |
| GET | `/parcels/incoming` · `/parcels/outgoing` | CASHIER+ (laantiisa) |
| POST | `/parcels/:id/load` `{trip_id}` · `/arrive` · `/deliver` `{pin, name}` | CASHIER+ |
| POST | `/parcels/:id/void` · `/mark-missing` · `/mark-damaged` | BM+ |
| POST | `/cash-sessions/open` · `/cash-sessions/:id/close` · `/approve` | CASHIER / BM+ |
| GET | `/cash-sessions/current` | CASHIER+ |
| GET/PUT | `/exchange-rates/today` | all / SA |
| GET | `/reports/revenue` `/occupancy` `/parcels` `/exceptions` `/inter-branch` `/cashier-variance` | BM+ (SA: all) |
| GET | `/audit-logs` | BM+ |
| GET | `/public/track/:code?phone_last4=` | public (Phase 3) |

## 6. Amniga
- HTTPS kaliya · CORS: domain-ka website-ka oo keliya.
- Rate limit login (5 isku day / daqiiqo) · account lock 15 daqiiqo.
- Refresh token rotation + revoke marka logout ama user la xiro.
- Password ugu yaraan 8 xaraf; Super Admin waa in uu beddelo password-ka default-ka ah.
- `pickup_pin` waa hashed. Taleefannada warbixinada dadweynaha waa la qariyaa.
- Super Admin action kasta audit ayuu galaa.

## 7. Marxaladaha (Roadmap)
| Phase | Backend |
|---|---|
| **1 — MVP** | auth, users, branches, routes, vehicles, drivers, trips, seat map/hold, bookings, parcel categories, parcels (dhammaan statuses), pricing, payments (cash), cash sessions, exchange rate, audit, warbixino aasaasi |
| **2** | SMS, Zaad/eDahab reference, idempotent offline sync, storage fees, inter-branch report, sawirada alaabta |
| **3** | public tracking, online booking, driver app endpoints |

## 8. Su'aalo Furan
1. Magaca laanta 3aad iyo routes-ka saxda ah.
2. Tirada kuraasta gaari kasta / seat layout.
3. Qiimayaasha hadda (USD/SLSH), alaabta: kg mise xabbad?
4. COD ma la isticmaalaa?
5. Zaad/eDahab Phase 1?
6. SMS provider (Telesom?).

## 9. Changelog / Xaaladda
- **2026-11-24** — Naqshadda, xeerarka (`CLAUDE.md`, `BUSINESS_RULES.md`) iyo warbixintan la qoray. Code: 0%.
