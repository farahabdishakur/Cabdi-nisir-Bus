# CLAUDE.md — Cabdinasir Bus Web (Xeerarka Repo-ga)

Repo-gan waa **Website-ka (Dashboard-ka)** ee shaqaalaha iyo Super Admin-ka Cabdinasir Bus.
Backend-ku wuxuu ku jiraa repo gaar ah: `cabdinasir-bus-backend` — xiriirku waa **REST API** (`/api/v1`) oo keliya.

Akhri ka hor intaadan wax beddelin:
- `docs/UI_RULES.md` — xeerarka naqshadda, luqadda, daabacaadda
- `docs/REPORT.md` — bogagga (pages), role kasta waxa uu arko, xaaladda
- Xeerarka ganacsiga waxay ku qoran yihiin backend-ka: `cabdinasir-bus-backend/docs/BUSINESS_RULES.md`

---

## 1. Tech Stack (go'aan la gaadhay)
- **Framework:** Next.js 15 (App Router) · React 19 · TypeScript (strict)
- **Styling:** Tailwind CSS + shadcn/ui
- **Data:** TanStack Query (server state) · Zustand (UI state yar) · Zod (form validation)
- **Forms:** React Hook Form + Zod
- **i18n:** next-intl — **Af-Soomaali (default)** + English
- **PWA / Offline:** service worker + IndexedDB queue (Phase 2)
- **Daabacaad:** CSS print 80mm (thermal) + A4 manifest · barcode/QR: `bwip-js` / `qrcode`
- **Tests:** Vitest + Testing Library · Playwright (e2e)

## 2. Qaab-dhismeedka
```
src/
  app/
    (auth)/login/
    (dashboard)/
      layout.tsx              sidebar + topbar (laanta, user, cash session)
      page.tsx                dashboard (role kasta mid u gaar ah)
      trips/  trips/[id]/     safarada + khariidadda kuraasta
      bookings/
      parcels/new/  parcels/incoming/  parcels/outgoing/  parcels/[code]/  parcels/deliver/
      cash/                   sanduuqa (fur/xir)
      reports/
      admin/                  branches, routes, vehicles, drivers, users, categories, pricing, rates  (SA)
      audit/
    print/receipt/[id]  print/label/[code]  print/manifest/[tripId]
  components/   ui/ (shadcn)  seat-map/  parcel-form/  receipt/  data-table/
  lib/          api-client.ts  auth.ts  permissions.ts  money.ts  format.ts
  messages/     so.json  en.json
```

## 3. Xeerarka Lagama Maarmaanka ah (MUST)
1. **Backend-ka ayaa go'aamiya.** Frontend-ku qiime ma xisaabiyo — wuxuu wacaa `POST /parcels/quote` oo muujiyaa natiijada. Qiime weligaa ha u dirin backend-ka.
2. **Permissions UI = qurxin kaliya.** `lib/permissions.ts` wuxuu qariyaa badhamada, laakiin amniga dhabta ah waa backend. Ha ku tiirsanaan.
3. **Lacag:** API-ga wuxuu soo celiyaa cents (integer). Muujinta waxaa sameeya `lib/money.ts` oo keliya (`$4.60`, `46,000 SLSH`). Float xisaab ha ku samaynin.
4. **Qoraal kasta oo user-ku arko** wuxuu ku jiraa `messages/so.json` + `en.json`. Qoraal toos ah (hard-coded) component-ka ha ku qorin.
5. **Error codes** backend-ka (`SEAT_TAKEN`, `NO_OPEN_SESSION`…) waxaa loo turjumaa `messages/*.json → errors.*`.
6. **Tokens:** access token xusuusta (memory), refresh token `httpOnly` cookie. `localStorage` token ha gelin.
7. **POST lacageed kasta** wuxuu diraa `Idempotency-Key` (uuid) — badhanka laba jeer la riixo lacag laba jeer ma noqoto. Badhanka waa la xiraa (disable) inta request-ku socdo.
8. **Ficil khatar ah** (void, cancel trip, close cash) → dialog xaqiijin + sabab qoran.
9. Bog kasta waa inuu ku shaqeeyaa **taleefan (360px)**, tablet iyo desktop.
10. `.env.local` lama commit-gareeyo; `NEXT_PUBLIC_API_URL` ku dar `.env.example`.

## 4. Ka hor commit kasta
```
npm run lint && npm run typecheck && npm test
```
Component cusub oo muhiim ah (seat map, parcel form, cash close) = test.

## 5. Warbixinta (Report) — waajib
Marka bog/feature la dhammeeyo, cusboonaysii `docs/REPORT.md` → **Changelog / Xaaladda**. Bog cusub → ku dar shaxda bogagga.
