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

Laamaha: **Boorama**, **Wajaale**, **Laanta 3aad** (la xaqiijin doono).

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

**Booking:** `CONFIRMED → BOARDED` · `CONFIRMED → VOIDED`

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

## 8. Notifications (Phase 2)
- Alaab la diiwaangeliyay → SMS qaataha: koodh + PIN.
- Alaab gaadhay → SMS qaataha.
- Alaab aan la qaadin 3 maalmood → xusuusin.
