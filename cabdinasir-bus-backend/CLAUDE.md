# CLAUDE.md — Cabdinasir Bus Backend (Xeerarka Repo-ga)

Repo-gan waa **Backend API** ee nidaamka Cabdinasir Bus (rakaab + alaab + lacag).
Frontend-ku wuxuu ku jiraa repo gaar ah: `cabdinasir-bus-web`. Labaduba waxay ku xiriiraan **REST API + JSON** oo keliya.

Akhri ka hor intaadan wax beddelin:
- `docs/BUSINESS_RULES.md` — xeerarka ganacsiga (qiimaha, kuraasta, alaabta, lacagta). **Kuwan ma jebin kartid.**
- `docs/REPORT.md` — warbixinta farsamada (modules, database, API, amniga).

---

## 1. Tech Stack (go'aan la gaadhay — ha beddelin la'aan ogolaansho)
- **Runtime:** Node.js 22 LTS · **Language:** TypeScript (strict)
- **Framework:** NestJS 11
- **Database:** PostgreSQL 16 · **ORM:** Prisma 6 (migrations kaliya Prisma Migrate)
- **Auth:** JWT (access 15 daqiiqo + refresh 7 maalmood), password hash: argon2
- **Validation:** class-validator DTOs · **Docs:** OpenAPI/Swagger at `/api/docs`
- **Tests:** Jest (unit) + Supertest (e2e) + Postgres test container
- **Jobs (Phase 2):** BullMQ + Redis (SMS, digniinaha alaabta aan la qaadin) — MVP-ga kuma jiro

## 2. Qaab-dhismeedka Folder-ada
```
src/
  main.ts
  common/        guards, decorators (@Roles, @CurrentUser), filters, interceptors (audit)
  auth/          login, refresh, logout, JwtAuthGuard (global)
  branches/  users/  routes/  vehicles/  drivers/  parcel-categories/
  settings/      pricing settings + exchange rates
  trips/         trips + seat map + seat hold + manifest
  bookings/      tigidhada rakaabka
  parcels/       alaabta + tracking + status history
  pricing/       pricing.ts — MEELNA kale lagama xisaabiyo qiimo
  cash/          payments (recordPayment) + cash sessions
  reports/  audit/
prisma/
  schema.prisma  migrations/  seed.ts
test/
```
Module kasta: `*.controller.ts` (HTTP kaliya) → `*.service.ts` (logic) → Prisma. Controller-ku logic ma yeesho.

## 3. Xeerarka Lagama Maarmaanka ah (MUST)
1. **Lacagtu waa integer** — `amount_cents` (USD senti) ama `amount_slsh`. Weligaa `float` ha u isticmaalin lacag.
2. **Qiimaha waxaa xisaabiya `PricingService` oo keliya.** Client-ka qiime kama aqbalno; wuxuu soo diraa xogta (route, kg, category), server-ka ayaa xisaabiya.
3. **Branch scoping:** query kasta oo shaqaale sameeyo waxaa lagu xiraa `branch_id`-giisa (ama `from/to_branch` alaabta). Super Admin kaliya ayaa ka badbaada. Ku samee `BranchScopeGuard` + service layer — labadaba.
4. **Wax lama tirtiro (no hard delete)** lacag, tigidh, alaab, payment. Kaliya `status = VOIDED` + `void_reason` + `voided_by`.
5. **Audit log** — POST/PATCH/DELETE kasta waxaa qora `AuditInterceptor`: user, action, entity, before, after, ip, time.
6. **Transactions:** booking + payment, parcel + payment, cash close — mid kasta hal `prisma.$transaction` gudaheed.
7. **Kursiga laba jeer lama iibin karo:** unique index `(trip_id, seat_no) WHERE status <> 'VOIDED'`. Ha ku kalsoonaan hubin code kaliya.
8. **Lambarada rasiidka** waa taxane laan kasta (`BOR-T-000123`, `WAJ-P-000045`) — waxaa laga sameeyaa `sequences` table gudaha transaction.
9. **Idempotency:** POST-yada lacagta leh waxay qaataan header `Idempotency-Key` (offline sync ee frontend-ka darteed).
10. **Waqtiga:** DB-ga UTC; warbixinada iyo "maalinta" waxaa lagu xisaabiyaa `Africa/Mogadishu` (UTC+3).
11. **Status transitions** waxay maraan state machine (`docs/BUSINESS_RULES.md §5`). Status si toos ah ha u beddelin.
12. **Sirta** (`DATABASE_URL`, `JWT_SECRET`, SMS keys) waxay ku jiraan `.env` oo keliya — weligaa ha commit-gareynin. `.env.example` waa la cusboonaysiiyaa.

## 4. Habka Code-ka
- Magacyada code-ka: **English** (`parcel`, `booking`). Fariimaha error-ka ee user-ka: koodh (`SEAT_TAKEN`) — frontend-ka ayaa u turjuma Af-Soomaali.
- Error format: `{ "error": { "code": "SEAT_TAKEN", "message": "...", "details": {} } }`
- Pagination: `?page=&limit=` (max 100), jawaabta `{ data, meta: { page, limit, total } }`
- Endpoints: `/api/v1/...`, kebab-case, magac jamac (`/parcels`, `/cash-sessions`)

## 5. Ka hor commit kasta
```
npm run lint && npm run typecheck && npm test && npm run test:e2e
```
- Feature cusub = test cusub (gaar ahaan pricing, seat lock, branch scope, void).
- Migration cusub = magac macno leh (`add_parcel_cod_fields`), lama beddelo migration hore.

## 6. Warbixinta (Report) — waajib
Marka feature la dhammeeyo, cusboonaysii `docs/REPORT.md` qaybta **Changelog / Xaaladda**: maxaa la dhisay, maxaa haray, go'aamo cusub. Xeer ganacsi oo cusub → `docs/BUSINESS_RULES.md`.
