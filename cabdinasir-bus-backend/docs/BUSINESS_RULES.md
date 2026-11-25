# Xeerarka Ganacsiga (Business Rules) — Cabdinasir Bus

Xeerarkan waxay ka yimaadeen shuruudaha shirkadda (boodhka xafiiska) iyo baahida ka hortagga lacag lumis.
Backend-ka ayaa fuliya dhammaantood; frontend-ku wuu muujiyaa laakiin ma go'aamiyo.

---

## 1. Qaybaha & Awoodaha

| Role | Cidda | Xadka |
|---|---|---|
| `SUPER_ADMIN` | Mulkiilaha / xafiiska guud | Dhammaan laamaha |
| `BRANCH_MANAGER` | Maamulaha laanta (sub-admin) | Laantiisa oo keliya |
| `CASHIER` | Karraaniga | Laantiisa + shaqadiisa |
| `DRIVER` | Darawalka (ikhtiyaari) | Safaradiisa (read-only) |

Laamaha: **Boorama — Laanta 1 (`BO1`)**, **Boorama — Laanta 2 (`BO2`)**, **Wajaale (`WAJ`)**.

### Laamaha isku magaalada ah (Boorama 1 & 2)
| Shay | Xeerka |
|---|---|
| Safarada | **Waa la wadaagaa**: safar ka baxa BO1 → WAJ, BO2 sidoo kale way arkaysaa oo tigidh ka iibin kartaa (isla seat map). |
| Tigidh | Rasiidka & lacagta waa **laanta iibisay** (`BO2-T-…`). Void-ka waxaa go'aamiya maamulaha laantaas. |
| Alaab | Laan kasta alaabteeda (`CB-BO2-…`). Gaariga Boorama → Wajaale wuxuu qaadaa alaabta labada laamood. Alaab u socota BO2 waxay ku iman kartaa safar WAJ → BO1; **BO2 kaliya** ayaa xaqiijisa/wareejisa. |
| Route / alaab BO1 ⇄ BO2 | **Lama oggola** (isku magaalo) — `SAME_CITY`. |
| Gaarigu yimid (ARRIVED) | Maamulaha laan kasta oo magaalada ah. |
| Bixitaan (DEPARTED), beddel safar | Maamulaha laanta safarka leh. |
| Dami wadaagga | `shareTripsWithinCity = 0` (Super Admin) → laan kasta gooni. |

### Shaxda faahfaahsan
| Ficil | SUPER_ADMIN | BRANCH_MANAGER | CASHIER | DRIVER |
|---|:-:|:-:|:-:|:-:|
| Laamo / routes / gaadiid / qiimayaal | ✅ | 👁 | 👁 | ❌ |
| Shaqaale abuur / xir | ✅ | ✅ laantiisa (CASHIER, DRIVER kaliya) | ❌ | ❌ |
| Safar abuur / beddel | ✅ | ✅ safarada ka baxa laantiisa | ❌ | ❌ |
| Tigidh iib | ✅ | ✅ | ✅ | ❌ |
| Alaab diiwaangeli | ✅ | ✅ | ✅ | ❌ |
| Alaab gaadhay xaqiiji / wareeji | ✅ | ✅ laanta loo diray | ✅ laanta loo diray | ❌ |
| Void tigidh/alaab | ✅ | ✅ (sabab waajib) | codsi kaliya | ❌ |
| Discount | ✅ xad la'aan | ≤ `max_discount_pct` (default 10%) | ❌ | ❌ |
| Cash session fur/xir | ✅ | ✅ + ansixi | ✅ kan isaga | ❌ |
| Warbixino | ✅ dhammaan | laantiisa | shaqadiisa maanta | manifest-kiisa |
| Audit log | ✅ | laantiisa | ❌ | ❌ |
| Sicirka beddelka (exchange rate) | ✅ | 👁 | 👁 | ❌ |

👁 = arki kara, ma beddeli karo.

---

## 2. Safarada (Trips)
- Safar = `route` + `vehicle` + `driver` + `departure_at`.
- Hal gaari laba safar oo isku waqti ah ma yeelan karo.
- Kuraasta safarka = `vehicle.seat_layout` (tusaale Hiace: 14 kursi + kursiga darawalka oo aan la iibin).
- Marka status-ku noqdo `DEPARTED`: tigidh cusub lama iibin karo, manifest-ka waa la xiraa (locked).

## 3. Tigidhada (Bookings)
- Waxaa waajib ah: `trip`, `seat_no`, `passenger_name`, `passenger_phone`.
- Kursi = hal booking firfircoon (DB unique index).
- **Seat hold:** marka karraanigu kursi doorto, waxaa la xiraa **3 daqiiqo** (`seat_holds`) si laan kale u qaadan. Marka lacagta la bixiyo → booking; haddii kale hold-ku wuu dhacaa.
- Qiimaha = `route.ticket_price` (+ `front_seat_surcharge` haddii kursiga hore) − discount la ogolaaday.
- Joojin ka hor bixitaanka: Manager, sabab, lacag celin (`refund` payment taban). Ka dib bixitaanka: lama joojin karo.
- Rakaab aan tigidh lahayn gaariga ma fuuli karo — manifest-ka ayaa darawalka la siiyaa.

## 4. Alaabta (Parcels)
### 4.1 Diiwaangelin — xogta waajibka ah
- Diraha: magac + taleefan · Qaataha: magac + taleefan *(Shuruudda boodhka #2)*
- Laanta loo dirayo (≠ laanta laga dirayo)
- `category`, `pieces` (≥1), `weight_kg`, `description`
- `declared_value` (ikhtiyaari laakiin caymisku wuu u baahan yahay)
- `is_fragile`, `payer`: `SENDER` (hadda bixi) ama `RECEIVER` (COD)

### 4.2 Noocyada (categories) — Super Admin ayaa maamula
Xawaash/Raashin · Kabo · Dhar · Elektaroonig · Dukumenti · Qalab guri · Daawo · Kale
- Nooc kasta: `base_fee`, `per_kg_multiplier`, `is_prohibited`.
- `is_prohibited = true` (hub, kiimiko, shidaal, alaab sharci darro ah…) → backend-ku wuu diidaa: `PARCEL_PROHIBITED` *(Shuruudda #4)*.

### 4.3 Shuruudaha kale
- Alaab aan la diiwaangelin shirkaddu mas'uul kama aha *(Shuruudda #5)* — sidaa darteed alaab kasta oo gaariga la saaro waa inay leedahay `tracking_code`.
- Lacagta rarista waa la bixiyaa *(Shuruudda #3)*: `SENDER` → isla markiiba; `RECEIVER` → ka hor wareejinta, lama wareejin karo lacag la'aan.
- Alaabta si wanaagsan ha loo xirxiro *(Shuruudda #1)* — karraanigu wuxuu calaamadeeyaa `packaging_ok`.

### 4.4 Wareejinta
- Qaataha waa inuu keenaa `tracking_code` **ama** `pickup_pin` (4 god, SMS-ka lagu diro) + magaca.
- Alaab aan la qaadin `uncollected_days` (default 7) → digniin; ka dib `storage_fee_per_day`.

## 5. State Machines

**Trip:** `SCHEDULED → BOARDING → DEPARTED → ARRIVED → CLOSED` (· `CANCELLED` ka hor `DEPARTED`)

**Booking:** `RESERVED → CONFIRMED | VOIDED | EXPIRED` · `CONFIRMED → BOARDED | VOIDED`

**Parcel:**
```
REGISTERED → LOADED → IN_TRANSIT → ARRIVED → DELIVERED
REGISTERED → VOIDED
IN_TRANSIT/ARRIVED → MISSING | DAMAGED   (Manager kaliya, warbixin waajib)
```
- `LOADED` waa in lagu xiraa `trip_id`. `ARRIVED` waxaa sameeya laanta loo diray oo keliya.

## 6. Qiimaynta (Pricing) — `PricingService`
```
ticket  = route.ticket_price_cents + (front_seat ? front_seat_surcharge_cents : 0) − discount
parcel  = category.base_fee_cents
        + ceil(weight_kg) × route.parcel_per_kg_cents × category.per_kg_multiplier
        + (is_fragile ? fragile_surcharge_cents : 0)
        + (insured ? round(declared_value_cents × insurance_pct) : 0)
parcel  = max(parcel, route.parcel_min_fee_cents)
```
- Natiijada waxaa lagu kaydiyaa `price_breakdown` (JSON) si mar dambe loo arko sida loo xisaabiyay.
- Qiimaha marka la beddelo, tigidh/alaab hore isma beddelaan (snapshot).
- Lacagta: aasaasigu waa **USD**; SLSH waxaa lagu beddelaa `exchange_rates` ee maanta (Super Admin ayaa dejiya).

## 7. Lacagta & Ka Hortagga Lumis
1. Payment kasta: `method` (`CASH`, `ZAAD`, `EDAHAB`), `currency`, `amount`, `cashier_id`, `cash_session_id`, `reference` (Zaad/eDahab txn id — waajib).
2. Karraani lacag ma qaadan karo isagoo aan cash session furan haysan (`NO_OPEN_SESSION`).
3. **Xiritaanka maalinta:** karraanigu wuxuu qoraa lacagta uu tiriyay (USD & SLSH gooni) → nidaamku wuxuu xisaabiyaa `expected` → `variance = counted − expected` → Manager ansixiyaa. Variance ≠ 0 waxay gashaa warbixinta Super Admin.
4. Void, discount, refund, variance — dhammaan waxay ka muuqdaan warbixinta "Exceptions".
5. **Inter-branch:** COD alaabta laanta B ku qaadato iyadoo laanta A dirtay — warbixin muujinaysa dakhli laan kasta.
6. Rasiidku waa taxane; lambar booday (gap) lama oggola.

## 8. Kharashka (Expenses)
- Karraani/Manager wuxuu diiwaangeliyaa kharash ka baxa sanduuqiisa: shidaal, mushahar darawal, dayactir, kiro, adeegyo, mushahar, kale.
- Waa `Payment` taban (`EXPENSE`) → lacagta la filayo sanduuqa way yaraanaysaa (variance ma keeno).
- Sanduuqa kama bixi karto lacag ka badan inta ku jirta (`INSUFFICIENT_CASH`).
- Void: **Manager** + sabab, kaliya inta sanduuqii furan yahay (lacagta dib ayay ugu noqotaa). Sanduuq xiran → sixitaan cusub.
- Warbixinada: dakhli − kharash = **net**.

## 9. Deposits (Wareejinta lacagta)
- Lacagta sanduuqa waxaa loo wareejiyaa **xafiiska guud / bangi / mobile money** → `Payment` taban (`DEPOSIT`).
- Deposit **dakhli ma aha, kharashna ma aha** — warbixinada si gooni ah ayay uga muuqataa.
- **Super Admin** ayaa xaqiijiya inuu helay (`confirm`). Deposit aan la xaqiijin = su'aal (warbixin `unconfirmed=true`).
- Silsiladda lacagta: macmiil → sanduuqa karraaniga → (xiritaan + variance) → deposit → Super Admin xaqiijiyay.

## 10. Codsiyada Void (Void Requests)
- Karraanigu void ma sameeyo: wuxuu sameeyaa **codsi** (sabab + lacag celin haa/maya).
- Hal codsi oo sugaya hal shay kasta (`REQUEST_PENDING`).
- Manager-ka laanta ayaa **ansixiya** (void-ka dhabta ah waa la fuliyaa) ama **diida**. Qofku codsigiisa ma ansixin karo.

## 11. Beddelka Tigidhka (Transfer)
- Ka hor bixitaanka: safar kale (isla laanta laga baxayo) ama kursi kale.
- Discount-kii hore wuu sii jiraa. Farqiga qiimaha: kordhay → lacag la qaado (`PAYMENT_REQUIRED`); dhimay → lacag celin. (`TRANSFER_DIFF`)
- Audit: safarkii/kursigii hore iyo kan cusub.

## 12. Dib u Daabacid (Reprint)
- Rasiid/label dib loo daabaco waa la tiriyaa (`printCount`) + audit — rasiid nuqul ah si khiyaano looguma isticmaali karo.

## 13. SMS (Notifications)
| Dhacdo | Cidda | Fariinta |
|---|---|---|
| Alaab la diiwaangeliyay | Qaataha | koodh + **PIN** + lacagta COD |
| Alaab gaadhay | Qaataha | koodh + laanta + COD |
| Alaab aan la qaadin (3 maalmood, 6 maalmood) | Qaataha | xusuusin + khidmadda kaydka |
| Alaab la wareejiyay | Diraha | xaqiijin |
- Kaliya lambarada mobile-ka (06x) — landline (610700) SMS ma helaan.
- Outbox: fariinta waxaa la kaydiyaa isla transaction-ka ficilka; worker ayaa diraya; 5 isku day.
- PIN-ka laguma kaydiyo database-ka marka SMS-ka la diro (`PIN: ****`).

## 14. Offline
- Alaab diiwaangelin offline waa la oggol yahay (sync + Idempotency-Key + PIN client-ka).
- Tigidh iib, wareejin alaab, void, xiritaan sanduuq — **online kaliya**.
- Faahfaahin: `docs/DEPLOYMENT.md §4`.

## 15. Tracking Dadweyne
- Koodhka + 4-ta god ee ugu dambeeya taleefanka qaataha/diraha → xaaladda alaabta.
- Magac iyo taleefan lama muujiyo. 10 isku day / daqiiqo.

## 16. Sixitaanka Qaladaadka
- **Alaab:** magac / taleefan / sharraxaad. Karraaniga laanta diray: inta aan gaariga ka bixin (REGISTERED/LOADED). Manager: ilaa la wareejiyo. Qiimaha, miisaanka, nooca **lama beddeli karo** → void + diiwaangelin cusub.
- **Tigidh:** magaca / taleefanka rakaabka, ka hor bixitaanka.
- Sixitaan kasta: sabab waajib + audit (qiimihii hore iyo kan cusub).

## 17. PIN Lumay
- Shaqaalaha laanta diray ama tan loo diray: **hubi aqoonsiga (ID)** → `reset-pin` → PIN cusub (SMS + rasiid). PIN-kii hore isla markiiba wuu dhacaa. Audit.

## 18. Gaari Xumaaday (Move Bookings)
- Manager: rakaabka oo dhan + alaabta la raray → safar kale **isla route-ka**.
- Kursigii qofka haddii uu bannaan yahay waa la siiyaa; haddii kale kursiga ugu horreeya ee bannaan. Qiimaha isma beddelo.
- Kuraas ku filan ma jiraan → waa la diidaa (`NOT_ENOUGH_SEATS`). Kadib safarkii hore waa la joojin karaa (CANCELLED).

## 19. Sanduuq Laga Tagay (Force Close)
- Karraanigu wuu baxay sanduuqa oo furan: **Manager-ka laanta** ayaa lacagta tiriya oo xira (sabab waajib, audit, `forceClosedById`).
- Variance-ku wuxuu ku dhacaa karraanigii sanduuqa lahaa.

## 20. Badhan Laba Jeer La Riixay
- Tigidh, alaab, kharash, deposit: `Idempotency-Key` → lacag laba jeer lama qaado.

## 21. Live Updates
- Seat map, alaabta imanaysa, codsiyada void, sanduuqyada la xiray — si toos ah ayay u cusboonaadaan (`GET /events`, SSE).
- Laan kasta waxay helaysaa dhacdooyinka laamaheeda oo keliya; magac/taleefan laguma diro.

## 22. Amniga Akoonnada
- Password: ugu yaraan 8 xaraf, xaraf + tiro. Akoon cusub / password la reset-gareeyay = **ku-meel-gaar** → waa in la beddelaa ka hor shaqo kale (`PASSWORD_CHANGE_REQUIRED`).
- User la xiray, role/laan la beddelay, password la beddelay, "logout-all" → **dhammaan tokens-ka isla markiiba way dhacaan** (`SESSION_REVOKED`).
- Login kasta (guul/fashil) audit ayuu galaa. 5 isku day oo khaldan → akoonka 15 daqiiqo waa xiran yahay.
- PIN alaabta: 5 isku day oo khaldan → **alaabta waa xiran tahay** (`PIN_LOCKED`) → hubi aqoonsiga → `reset-pin`.

## 23. Hubinta Lacagta (Integrity)
Maalin kasta 08:00 nidaamku wuxuu hubiyaa, haddii dhibaato jirtana **SMS ayuu u diraa Super Admin**:
- Sanduuq furan > 24 saac · sanduuq xiran oo aan la ansixin > 48 saac
- Alaab "diraha bixiyay" oo lacag la'aan ah · COD la wareejiyay oo lacag la'aan ah · tigidh lacag la'aan ah
- Deposit aan la xaqiijin > 72 saac · alaab jidka ku jirta > 48 saac · safar baxay oo aan imaan > 24 saac
- SMS fashilmay
Warbixin: `GET /reports/integrity` — liis madhan = wax walba waa sax.

## 24. Ballan Taleefan (Phone Reservation)
Macmiilku wuu soo wacayaa → karraanigu kursi ayuu u qabanayaa **lacag la'aan** → macmiilku xafiiska ayuu ku bixiyaa.
| Shay | Xeerka |
|---|---|
| Xogta | Safar, kursi, magac, taleefan. Sanduuq furan **looma baahna** (lacag ma jirto). |
| Wakhtiga | Kursiga waa la hayaa ilaa **`reservationCutoffMinutes` (default 60) daqiiqo ka hor bixitaanka**. Ka dib → `EXPIRED`, kursigu wuu furmayaa (daqiiqad kasta + isla markiiba marka seat map la furo). |
| Goor dambe | Haddii wakhtigaas la gaaray → ballan lama samayn karo (`RESERVATION_CLOSED`) — iib lacag leh kaliya. |
| Xad | Hal taleefan ugu badnaan **`maxReservationsPerPhone` (default 4)** ballan hal safar (`RESERVATION_LIMIT`). |
| SMS | Macmiilka: kursiga, safarka, lambarka ballanta, qiimaha, wakhtiga ugu dambeeya ee bixinta. |
| Bixin | `confirm` → tigidh dhab ah (`CONFIRMED`), lacag (sanduuq furan waajib). Laan kasta oo magaalada ah way xaqiijin kartaa (Boorama 1 ama 2); lacagtu waxay gashaa laantaas. Discount: Manager kaliya. |
| Joojin | Macmiilku wuu ka noqday → karraanigu wuu sii daayaa (`cancel-reservation`, sabab). Lacag ma jirto. |
| Bixitaan | Ballan aan la bixin marka gaarigu baxo → `EXPIRED` (ma iman). Safar leh ballamo kaliya waa la joojin karaa. |
| Warbixino | Dakhliga & tirada rakaabka: **tigidhada la bixiyay oo keliya**. Manifest: `reservedUnpaid` gooni. |
| Dami | `reservationCutoffMinutes = 0` → ballan taleefan lama oggola. |
| Online (mustaqbal) | Isla nidaamkan ayaa loo isticmaali doonaa marka macmiilku online ka dalbado. |

## 25. Lacagta Zaad / eDahab
Macmiilku lacagta wuxuu u soo diraa **lambarka Zaad/eDahab ee laanta** (laan kasta lambarkeeda — Super Admin ayaa dejiya; rasiidka, SMS-ka ballanta iyo bogga dadweynaha ayuu ka muuqdaa).
| Shay | Xeerka |
|---|---|
| Waxa la qoro | **Lambarka transaction-ka** (SMS-ka Zaad) + **lambarka taleefanka lacagta laga soo diray** (waajib — ma aha qasab inuu yahay rakaabka). |
| Xaqiijin | Karraanigu wuxuu arkaa SMS-ka Zaad ee taleefanka laanta → isla markiiba tigidhka/alaabta ayuu bixiyaa (Manager ma sugo). |
| Khiyaano | **Hal transaction = hal lacag.** Transaction hore loo isticmaalay → `MOBILE_REFERENCE_USED` (+ rasiidkii lagu isticmaalay). Database-ka laftiisa ayaa diida (laba karraani isku mar). Karraanigu ka hor wuu hubin karaa: `GET /payments/lookup`. |
| Calaamad | Tigidh/alaab kasta waxay muujinaysaa habka lacagta (Zaad/eDahab/Cash) + transaction-ka. Liisaska: `?paidVia=ZAAD`. |
| Sanduuqa | Zaad/eDahab **kuma jiraan** lacagta gacanta (expected cash) — sanduuqa xiritaankiisa kaliya cash ayaa la tiriyaa. |
| Celin | Void + celin → isla habkii (Zaad → Zaad) isla lambarkii laga soo diray. |
| Barbar dhig (reconcile) | Dhammaadka maalinta Manager-ku `GET /payments/mobile` wuxuu la barbar dhigaa bayaanka Zaad/eDahab → "la hubiyay". Lacag aan bayaanka ku jirin → void + baadhis. Aan la hubin > 48 saac → digniinta integrity (SMS Super Admin). |

## 26. Xisaabaadka (CashBook) & Mushaharka Darawallada
1. **Buugga laanta waa toos** — wuxuu ka dhashaa `payments` (tigidh, alaab, kayd, celin, kharash, wareejin, bixinta darawalka). Gacan laguma qoro; khalad waxaa lagu saxaa void (lacag celin), ma aha tirtir. Akoonnada: Cash $, Cash SLSH, Zaad, eDahab — mid kasta haraaga bilowga + haraaga socda.
2. **Buugga xafiiska guud** (Super Admin kaliya): wareejimaha laamaha ee la xaqiijiyay (IN, toos) + qoraallo gacan ah (IN: dakhli kale, raasumaal, deyn; OUT: shidaal, dayactir, kiro, mushahar, caymis, canshuur, adeegyo, iibsasho baabuur, bixin deyn, qaadasho milkiile, kale). Qoraal kasta: sabab, lacag, taariikh, ikhtiyaari laan/baabuur + sawirka biilka. Void + sabab; tirtir ma jiro (DB trigger).
3. **Qaabka mushaharka darawalka** — hal mar ayaa la dejiyaa, wuxuu shaqeeyaa laga bilaabo `effectiveFrom`:
   - `PER_TRIP` lacag go'an safar kasta · `PERCENT_TICKETS` % tigidhada safarka · `PERCENT_TRIP_INCOME` % tigidh + alaab · `MONTHLY_SALARY` mushahar bil.
   - **Kasbashadu waa toos:** safarku marka uu `ARRIVED` noqdo → kasbasho hal mar (idempotent, unique driver+trip). Mushaharka bisha: cron 1-da bil kasta (bishii hore), unique driver+period.
4. **Bixinta darawalka:** horumaris (advance) / bixin → cash-ka sanduuqa karraaniga (waa inuu ku filan yahay) ama xafiiska guud (Super Admin); goyn (deduction) lacag ma dhaqaajiso. Haraaga = kasbasho − bixin. Void bixin: sanduuqu waa inuu furan yahay (lacag celin).
5. **Faa'iido & khasaare (P&L):** dakhli (tigidh, alaab, kayd − celin + dakhli kale) − kharash (sanduuq + xafiis) − mushaharka darawalka (**markuu kasbaday**, ma aha markii la bixiyay). Kuma jiraan: raasumaal, deyn, iibsasho baabuur, qaadasho milkiile. Baabuur kasta: dakhliga safarradiisa − kharashka loogu qoray − mushaharka darawalka safarradaas.
