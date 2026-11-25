# Warbixinta Website-ka — Cabdinasir Bus Web

**Repo:** `cabdinasir-bus-web` · **Xaaladda:** v0.2.0 — dhammaystiran (online + offline + bogagga dadweynaha), browser dhab ah 26 tallaabo · **Taariikh:** 2026-11-24
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
| Xisaabaadka (buug laan/xafiis, P&L, mushaharka darawallada) | `/books` | SA, BM | 1 |
| Safka gaadiidka (maalinta) | `/dispatch` | SA, BM (maamul), CASHIER (arag + iib) | 1 |
| Buugga tigidhada warqadda (daabacaad) | `/print/blank-tickets` | SA, BM | 1 |
| Cabashooyinka (caddaynta sawir/video, go'aan) | `/claims`, `/claims/[id]` | SA, BM, CASHIER | 1 |
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
- **v0.4.0 (amni):** `SESSION_REVOKED` → u dir login · `PASSWORD_CHANGE_REQUIRED` → bogga beddelka password-ka (kaliya kan) · `change-password` wuxuu soo celiyaa tokens cusub · `TOO_MANY_ATTEMPTS` / `PIN_LOCKED` (→ badhanka "PIN cusub") · dashboard-ka laanta = Manager+ (karraaniga: safarada maanta + alaabta imanaysa + sanduuqiisa).
- **Boorama 2 laamood:** karraaniga BO2 wuxuu arkaa safarada BO1 → WAJ (isla seat map); rasiidku waa `BO2-T-…`. Liiska laanta loo dirayo ha muujin laanta isku magaalada ah (`SAME_CITY`).
- **v0.5.0 — Ballan taleefan:** seat map-ka kursi `RESERVED` (midab kale + wakhtiga uu dhacayo). Foomka tigidhka: badhan "**Ballan (taleefan)**" (magac + taleefan, lacag la'aan) iyo "**Iib (lacag)**". Liiska "Ballamaha maanta" (`GET /bookings?status=RESERVED`) → badhanka **Bixi** (`confirm`) iyo **Jooji** (`cancel-reservation`). Error: `RESERVATION_CLOSED` → "ka iibi lacag".
- **v0.6.0 — Zaad/eDahab:** `PaymentPicker`: Cash / Zaad / eDahab → Zaad: geli **transaction** + **taleefanka laga soo diray** (badhan "Hubi" → `GET /payments/lookup`). Rasiidka & liisaska: **calaamad "Zaad ✓" / "eDahab ✓"** + transaction. Rasiidka: lambarka Zaad/eDahab ee laanta (`branch.zaadNumber`). Bog Manager: **"Barbar dhig Zaad"** (`GET /payments/mobile?reconciled=false` → checkbox → `POST /payments/reconcile`). Error: `MOBILE_REFERENCE_USED` → "SMS-kan hore ayaa loo isticmaalay (rasiid …)".
- Super Admin: bogga **Integrity** (`GET /reports/integrity`) + **Xaaladda nidaamka** (`GET /health/details`).

## 9. Changelog / Xaaladda
- **2026-11-24** — Naqshadda, xeerarka (`CLAUDE.md`, `UI_RULES.md`) iyo warbixintan la qoray. Code: 0%.
- **2026-11-25** — **Phase 1 website-ka la dhisay** (v0.1.0): login + password ku-meel-gaar · dashboard role kasta · safarada + seat map (hold timer, live SSE) · iib tigidh (Cash/Zaad/eDahab + discount manager) · ballan taleefan (bixi / jooji) · tigidhada & ballamaha (void / codso void / sax / fuulay) · alaab dir (qiimaha live, autofill, PIN) · alaabta baxaysa (rar) · imanaysa (xaqiiji, maqan) · wareejin (PIN + COD + kayd) · faahfaahinta alaabta (taariikh, sawir, PIN cusub, sax, void, maqan/dhaawacmay) · sanduuqa (fur/xir, kharash, wareejin, ansixi, xir-karraani-tagay, Super Admin xaqiiji) · barbar dhig Zaad · codsiyada void · warbixino (xiritaan maalinle, dakhli, faa'iidada safarada, karraaniyada, integrity, CSV) · maamul (shaqaale, darawallo, laamo + lambarada Zaad, routes & qiime, gaadiid, noocyo, dejin, shirkadda) · daabacaad 80mm (tigidh, alaab + label xabbad kasta, QR) + manifest A4 · Af-Soomaali/English · taleefan 390px.
  Tests: 6 unit + **E2E 18 tallaabo (Playwright, backend dhab ah)** — dhammaan way gudbeen. Dockerfile + Caddy (app domain, /api → backend, SSE gzip la'aan).
  **Wali:** offline mode (PWA/IndexedDB — backend diyaar), bogga dadweynaha (tracking / jadwal), barcode scanner, dark mode.
- **2026-11-25** — **v0.2.0 dib-u-eegis + dhammaystir:**
  - *Dib-u-eegis madax-bannaan (website ↔ backend):* 10 arrimood waa la saxay — Super Admin bogagga alaabta laanta (laan ma leh) · badhamada safarka (bixitaan/joojin/beddel = maamulaha laanta safarka; gaadhay/xir = maamule magaalada loo socdo) · **dib u daabac waa la tiriyaa** (`?reprint=1` → `POST …/reprint`) · badhanka sax alaab · sanduuqyada maalin hore weli furan (backend `?open=true`) · sharraxaadda qiimaha (base_fee → "Qiimaha aasaasiga") · khaladaadka oo dhan Af-Soomaali (40+ koodh) · dejinta lacagta $ · codsiyada void (link + xaalad la turjumay) · safarada Move/Transfer (maanta + 2 maalmood, BOARDING-na).
  - *Cusub:* beddel kursi/safar (farqi qiimo) · beddel safar (gaari/darawal/waqti) · **jadwalka maalinta** (safaro badan) · beddel shaqaale (door/laan) · akoonka darawalka · **Nidaamka** (audit log, SMS + dib u dir, xaaladda server-ka) · **raadin guud** (topbar + `/`) · furayaasha F2/F3/F4 · **ka bixid toos ah 30 daqiiqo** (kombiyuutar la wadaago) · bogag 404/khalad · digniinta sicirka SLSH · darawalka: manifest · Wajaale safarka Boorama: arag kaliya · kursiga la hayo waa la sii daayaa marka bogga laga baxo · khaladaadka query-ga waa la muujiyaa.
  - ***Offline mode:*** alaab diiwaangelin internet la'aan (IndexedDB, PIN client, qiyaas, rasiid isla bogga) → sync toos ah (online + daqiiqad kasta, Idempotency-Key) · bogga `/offline` · service worker (reload offline → fadhigu ma dhaco) · topbar 📴 / ⏳.
  - ***Bogagga dadweynaha (login la'aan):*** `/track` (koodh + 4 god taleefan) · `/schedule` (safarada + kuraasta bannaan + sida loo ballansado) · xiriirka laamaha + lambarada Zaad · QR-ka rasiidka alaabta → `/track`.
  - Tests: 11 unit · **E2E 26 tallaabo** (oo ay ku jiraan offline → reload → sync, transfer, reprint, raadin, audit, tracking dadweyne) — dhammaan way gudbeen.
- **2026-11-25** — **v0.3.0 Xisaabaadka** (`/books`, maamulayaasha): buugga laanta (toos — Cash $/SLSH/Zaad/eDahab, haraaga socda, filter akoon, biil 📎, CSV) · buugga xafiiska (Super Admin: + Lacag gashay / − Lacag baxday, qaybo, laan/baabuur, sawir biil, void) · **Faa'iido & khasaare** (dakhli, kharash, mushaharka darawalka, faa'iido saafi, baabuur kasta, CSV) · **Mushaharka darawallada** (liis + haraaga, bayaan, qaabka mushaharka, bixin/advance/goyn/abaalmarin, void, mushaharka bisha) · sanduuqa: sawirka biilka kharashka (kamarad taleefan). Tests: 11 unit · **E2E 29 tallaabo** — dhammaan way gudbeen.
- **2026-11-25** — **Rasiidyada cusub (Receipt Voucher)** — qaabka warqadda shirkadda: tigidh (wadada + kursi sanduuq, Taariikh/Magaca macmilka/Waqtiga/Gaadhiga/Ku, Lacagta sanduuq, Saxeexa, QR yar), alaab (PIN sanduuq, COD), offline, iyo **rasiidka bixinta darawalka** (`/print/driver-payment/[id]`: la siiyay, wadarta kasbashada/bixinta, inta weli lagu leeyahay, laba saxeex) — si toos ah ayuu u furmaa marka la bixiyo. E2E 30 tallaabo — dhammaan way gudbeen.
- **2026-11-25** — **v0.4.0 Caddaynta & cabashooyinka:** bogga alaabta: sawir/video (kamarad taleefan, la yareeyo + calaamad, horumar %), gallery marxalad kasta + daawade (SHA-256) · alaab dir: "Sawir alaabta hadda" · wareejin: sawirkii diiwaangelinta (barbar dhig) + sawirka dhiibista (waajib haddii dejinta) · `/claims` + `/claims/[id]` (faylka caddaynta, hubinta ✓/✕, go'aan maamule). E2E 33 tallaabo — dhammaan way gudbeen.
- **2026-11-25** — **v0.5.0:** **naqshadeeyaha kuraasta** (nooc diyaar ah + riix meelaha, lambar toos ah) · **logo** (Dejinta → sidebar, login, rasiidyo, bogga macmiilka) · darawalka: laanta (Super Admin) · **dib-u-eegis madax-bannaan (12 arrimood)**: P&L laamaha oo dhan, biilasha (la yareeyo + khalad la tuso), soo dejinta (refresh + extension), tab-ka daabacaadda (popup blocker), taleefan 360px (stats), bogagga daabacaadda khalad, runMonthly/deliver khalad, lacag khaldan cabasho, qaybta gelinta, daawade video · Ingiriisiga: 74 qoraal oo maqnaa · khaladka faahfaahin ({seats}). Bug-yo E2E-gu helay: logo sidebar dib uma isku dayin, badhamada naqshadeeyaha form-ka ayay kaydinayeen. E2E 36 tallaabo — dhammaan way gudbeen.
- **2026-11-25** — **v0.6.0 Safka gaadiidka:** `/dispatch` (wadooyinka, buuxsamaya + kursiyada, safka ↑↓✕, baxay maanta, "Bilow maalinta" / ku dar, darawalka caadiga ah) · dashboard: safka hadda (laan kasta) + "Iibi tigidh" toos gaariga buuxsamaya · Super Admin: laamaha maanta (dakhli/kharash/saafi) · admin: darawalka caadiga ah ee gaari kasta · `QALABKA.md` (qalabka + internet la'aan). E2E 38 tallaabo — dhammaan way gudbeen.
- **2026-11-25** — **v0.7.0 Tigidhka warqadda:** iibka: "Lambarka tigidhka warqadda" → kaarka **Ku qor tigidhka warqadda** (lambar, taariikh, magac, taleefan, ka/ku, gaadhi, waqti, KURSI, lacag) + daabacaad ikhtiyaari · ballan bixin + sax · liiska tigidhada ✍️ · **buugga tigidhada** `/print/blank-tickets` (A4, 4 boggii, stub + tigidh, lambar taxane) · dejinta ticketMode. E2E 40 tallaabo — dhammaan way gudbeen.
