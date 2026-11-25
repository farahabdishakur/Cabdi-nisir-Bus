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
- **Styling:** Tailwind CSS 4 + components-keena yar (`src/components/ui.tsx`) — shadcn/ui lama isticmaalin (dependency yar)
- **Data:** TanStack Query (server state) · React state (forms) — validation-ka dhabta ah waa backend-ka
- **i18n:** `src/lib/i18n.tsx` + `src/messages/so.ts` (default) / `en.ts` — next-intl lama isticmaalin (fudud, client-side)
- **Live:** SSE `GET /events` (`@microsoft/fetch-event-source`, Authorization header) → queries-ka ayaa is-cusboonaysiiya
- **Offline:** `public/sw.js` (static cache-first · bogag & RSC network-first · `/api` weligiis) + IndexedDB queue (`lib/offline.ts`) → `POST /sync/parcels`. Alaab kaliya; tigidh/wareejin online kaliya.
- **Daabacaad:** CSS print 80mm (thermal) + A4 manifest · QR: `qrcode`
- **Tests:** Vitest (unit) · Playwright (e2e browser dhab ah: `e2e/run.mjs`)

## 2. Qaab-dhismeedka
```
src/
  app/
    login/  change-password/
    (app)/
      layout.tsx              sidebar + topbar (laanta, user, cash session)
      page.tsx                dashboard (role kasta mid u gaar ah)
      trips/  trips/[id]/     safarada + seat map + iib / ballan
      bookings/               tigidhada & ballamaha (bixi / jooji / void)
      parcels/new/  parcels/incoming/  parcels/outgoing/  parcels/[code]/  parcels/deliver/
      cash/                   sanduuqa, kharash, wareejin, sanduuqyada laanta
      zaad/                   barbar dhigga Zaad/eDahab (manager)
      void-requests/  reports/  admin/
    print/ticket/[id]  print/parcel/[id]  print/manifest/[id]
  components/   ui.tsx  domain.tsx (PaymentPicker, PartyInput, badges)  seat-map.tsx  booking-actions.tsx  shell.tsx  print.tsx
  lib/          api.ts  auth.tsx  i18n.tsx  live.ts  queries.ts  permissions.ts  format.ts  types.ts
  messages/     so.ts  en.ts
```

## 3. Xeerarka Lagama Maarmaanka ah (MUST)
1. **Backend-ka ayaa go'aamiya.** Frontend-ku qiime ma xisaabiyo — wuxuu wacaa `POST /parcels/quote` oo muujiyaa natiijada. Qiime weligaa ha u dirin backend-ka.
   *Ka reeban (keliya):* offline — `lib/pricing.ts` waa qiyaas (nuqul backend `pricing.ts`), rasiidka "≈" iyo "qiyaas" ayaa ku qoran; sync-ka server-ka ayaa go'aamiya. Backend-ka qaacidadiisa haddii la beddelo, `lib/pricing.ts` + `pricing.test.ts` sidoo kale beddel.
2. **Permissions UI = qurxin kaliya.** `lib/permissions.ts` wuxuu qariyaa badhamada, laakiin amniga dhabta ah waa backend. Ha ku tiirsanaan.
3. **Lacag:** API-ga wuxuu soo celiyaa cents (integer). Muujinta waxaa sameeya `lib/format.ts` oo keliya (`$4.60`, `46,000 SLSH`). Float xisaab ha ku samaynin.
4. **Qoraal kasta oo user-ku arko** wuxuu ku jiraa `messages/so.ts` + `en.ts`. Qoraal toos ah (hard-coded) component-ka ha ku qorin.
5. **Error codes** backend-ka (`SEAT_TAKEN`, `NO_OPEN_SESSION`…) waxaa loo turjumaa `messages/*.ts → errors.*`.
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
