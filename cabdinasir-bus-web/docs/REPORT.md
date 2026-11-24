# Warbixinta Website-ka — Cabdinasir Bus Web

**Repo:** `cabdinasir-bus-web` · **Xaaladda:** Naqshad (code wali lama bilaabin) · **Taariikh:** 2026-11-24
**Backend:** `cabdinasir-bus-backend` (`NEXT_PUBLIC_API_URL`)

---

## 1. Ujeeddada
Hal website oo ay ka shaqeeyaan dhammaan laamaha iyo Super Admin. Qof kasta marka uu soo galo, wuxuu arkaa oo keliya bogagga iyo xogta role-kiisa iyo laantiisa.

## 2. Waxa Role Kasta Arko

### 🔑 Super Admin
- **Dashboard guud:** dakhliga maanta laan kasta (USD/SLSH), tirada rakaabka, alaabta socota, variance-ka sanduuqyada, exceptions (void/discount)
- **Maamul (Admin):** Laamaha · Routes & qiimaha · Gaadiidka & seat layout editor · Darawallada · Shaqaalaha (dhammaan laamaha) · Noocyada alaabta (alaab mamnuuc ah) · Pricing settings · Sicirka beddelka maanta
- Wax kasta oo Branch Manager arko, laamaha oo dhan
- Warbixino + export (Excel/PDF) · Audit log

### 🏢 Branch Manager (laan kasta)
- Dashboard laanta: safarada maanta, kuraasta bannaan, alaabta imanaysa/baxaysa, lacagta karraaniyada
- Abuur/maamul safarada ka baxa laantiisa · qoondee gaari & darawal
- Shaqaalaha laantiisa (karraani, darawal)
- Ansixi: void, discount, xiritaanka sanduuqa
- Calaamadee alaab lumay/dhaawacmay
- Warbixinada laantiisa · audit log laantiisa

### 🧾 Karraani (Cashier)
- Dashboard: 3 badhan oo waaweyn + safarada maanta + alaabta imanaysa
- Fur sanduuqa subaxdii (haddii uusan furnayn, iib ma samayn karo)
- Tigidh iib (seat map) · Alaab dir · Alaab rar (gaariga ku xir) · Alaab gaadhay xaqiiji · Alaab wareeji
- Raadi rasiid/koodh/taleefan · dib u daabac rasiid
- Xir sanduuqa fiidkii

### 🚐 Darawal (ikhtiyaari, taleefan)
- Safaradiisa maanta + manifest (rakaab + alaab) — read-only

## 3. Liiska Bogagga (Pages)
| Bog | Path | Roles | Phase |
|---|---|---|---|
| Login | `/login` | all | 1 |
| Dashboard | `/` | all (mid kasta u gaar) | 1 |
| Safarada | `/trips` | SA, BM, CASHIER | 1 |
| Safar + Seat map + manifest | `/trips/[id]` | SA, BM, CASHIER | 1 |
| Tigidhada | `/bookings` | SA, BM, CASHIER | 1 |
| Alaab cusub | `/parcels/new` | SA, BM, CASHIER | 1 |
| Alaabta imanaysa | `/parcels/incoming` | SA, BM, CASHIER | 1 |
| Alaabta baxaysa / rar | `/parcels/outgoing` | SA, BM, CASHIER | 1 |
| Faahfaahinta alaabta + timeline | `/parcels/[code]` | SA, BM, CASHIER | 1 |
| Wareejin | `/parcels/deliver` | SA, BM, CASHIER | 1 |
| Sanduuqa | `/cash` | SA, BM, CASHIER | 1 |
| Warbixino | `/reports` | SA, BM | 1 |
| Admin (laamo, routes, gaadiid, darawal, shaqaale, noocyo, qiime, sicir) | `/admin/*` | SA (shaqaale: BM) | 1 |
| Audit log | `/audit` | SA, BM | 1 |
| Daabacaad (rasiid, label, manifest) | `/print/*` | SA, BM, CASHIER | 1 |
| Profile / beddel password | `/profile` | all | 1 |
| Kharashka (shidaal, darawal …) | `/cash/expenses` | SA, BM, CASHIER | 1 |
| Deposits (lacag u wareeji xafiiska) + xaqiijin | `/cash/deposits` | SA, BM, CASHIER | 1 |
| Codsiyada void (karraani → manager) | `/void-requests` | SA, BM, CASHIER | 1 |
| Xiritaanka maalinta laanta | `/reports/daily-close` | SA, BM | 1 |
| Shaqada karraaniyada | `/reports/cashiers` | SA, BM | 1 |
| SMS-yada (fashilmay → dib u dir) | `/admin/notifications` | SA, BM | 1 |
| Profile-ka shirkadda (rasiidka, shuruudaha) | `/admin/company` | SA | 1 |
| Manifest darawal | `/driver` | DRIVER | 2 |
| Tracking dadweyne | `/track` | public | 3 |
| Online booking | `/book` | public | 3 |

## 4. Socodka Muhiimka ah (User Flows)

**Tigidh iib:** Dashboard → "Tigidh Iib" → dooro safar (maanta, route) → seat map → riix kursi (hold) → magac + taleefan → qiimaha (backend) → habka lacagta → **Bixi** → rasiid daabac → seat map cusub.

**Alaab dir:** "Alaab Dir" → laanta loo dirayo → diraha + qaataha (taleefanka hore loo isticmaalay → autofill) → nooc, xabbad, kg, qiime la sheegay, fragile → qiimaha live (`/parcels/quote`) → cidda bixinaysa (Hadda / COD) → **Diiwaangeli** → rasiid + label(s) daabac.

**Alaab rar:** `/parcels/outgoing` → dooro safarka → scan/riix alaab kasta → "Gaariga lagu raray" → manifest.

**Alaab gaadhay:** `/parcels/incoming` (liiska waa la arkaa ka hor inta gaarigu iman) → gaarigu markuu yimaado: scan/riix mid kasta → "Gaadhay" → kuwa maqan si casaan ah ayay u muuqdaan → Manager ayaa la ogeysiiyaa.

**Wareejin:** raadi koodh/taleefan → hubi magaca + PIN → haddii COD: qaado lacagta → **Wareeji** → rasiid wareejin.

**Sanduuqa:** subax: "Fur" (lacagta bilowga ah) → fiid: "Xir" → geli inta la tiriyay (USD + SLSH) → nidaamka ayaa muujiya farqiga → Manager ansixiyaa.

## 5. Components Muhiim ah
- `SeatMap` — layout ka yimaada `vehicle.seat_layout`, states, hold timer, polling
- `ParcelForm` — debounced quote, phone autofill, prohibited warning
- `PartyInput` — magac + taleefan, raadinta macaamiisha hore
- `MoneyDisplay` / `PaymentPicker` — USD/SLSH, Cash/Zaad/eDahab + reference
- `StatusBadge` + `ParcelTimeline`
- `DataTable` — filter, search, pagination, export
- `ConfirmDialog` (sabab waajib) · `PrintLayout` (80mm / A4)
- `RoleGuard` / `can()` — qarinta UI

## 6. Xiriirka Backend-ka
- `lib/api-client.ts` — fetch wrapper: base URL, access token, refresh-ka automatic ah (401 → refresh → retry), `Idempotency-Key`, error-ka loo beddelo `{code, message}`.
- Types: laga sameeyaa OpenAPI-ga backend-ka (`openapi-typescript`) → `src/lib/api-types.ts` — gacanta lagu qorin.
- Query keys: `['trips', date]`, `['trip', id, 'seats']`, `['parcels', 'incoming', branchId]`…

## 7. Marxaladaha (Roadmap)
| Phase | Website |
|---|---|
| **1 — MVP** | login, dashboards, trips + seat map, bookings, parcels (dir, rar, gaadhay, wareeji), cash, admin, reports aasaasi, print, Af-Soomaali/English |
| **2** | offline/PWA, barcode scanner, Zaad/eDahab, darawal view, export Excel/PDF, dark mode |
| **3** | tracking dadweyne, online booking |

## 8. Su'aalo Furan
1. Printer thermal (80mm) ma haysaan? Barcode scanner?
2. Kombiyuutar mise taleefan/tablet ayaa xafiisyada lagu isticmaali doonaa?
3. Logo-ga shirkadda (file tayo sare leh).
4. Domain (tusaale `cabdinasirbus.com`)?

## 8b. Backend-ka diyaar ah (v0.2.0) — waxa website-ku isticmaali doono
- Tigidh: **transfer** (beddel safar/kursi + farqi), **reprint** (la tiriyo).
- Alaab: **sawir** (camera taleefanka / upload), **arrive-batch** (scan dhammaan → kuwa maqan), PIN + COD + khidmad kayd.
- Karraanigu void ma sameeyo → badhanka "Codso void".
- Autofill taleefanka: `GET /customers/lookup`.
- Offline: `GET /sync/bootstrap` (kaydi IndexedDB) + `POST /sync/parcels`.
- Rasiidka/label-ka: `GET /company` (magaca, ujeeddada, shuruudaha 5-ta, footer).
- Types: backend `npm run openapi` → `openapi.json` → `openapi-typescript`.
- Liiska error codes-ka (turjumaadda Af-Soomaaliga): backend `docs/REPORT.md §9`.
- **v0.3.0:** live updates `GET /events` (SSE — isticmaal `@microsoft/fetch-event-source` si Authorization header loo diro) → seat map & alaabta imanaysa refresh la'aan.
- Sixitaan: `PATCH /parcels/:id`, `PATCH /bookings/:id` · PIN lumay: `POST /parcels/:id/reset-pin` · Gaari xumaaday: `POST /trips/:id/move-bookings` · Sanduuq laga tagay: `POST /cash-sessions/:id/force-close` · Faa'iidada safarka: `GET /reports/trips-profit` · Jadwal dadweyne: `GET /public/trips`.
- Kharash/deposit: dir `Idempotency-Key`.

## 9. Changelog / Xaaladda
- **2026-11-24** — Naqshadda, xeerarka (`CLAUDE.md`, `UI_RULES.md`) iyo warbixintan la qoray. Code: 0%.
