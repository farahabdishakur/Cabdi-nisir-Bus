# Cabdinasir Bus — Naqshadda Nidaamka (System Design)

> Nidaam diiwaangeliya **rakaabka (kuraasta)** iyo **alaabta (parcels)**, xisaabiya lacagta si automatic ah, kana ilaaliya shirkadda lacag lumis.
> Shirkaddu waxay leedahay **3 laamood (branch)** + **Xafiiska Guud (Super Admin)** = 4 qaybood.

---

## 1. Maxaa loo baahan yahay? (Backend kaliya mise Website?)

Labadaba ayaa loo baahan yahay:

| Qayb | Shaqadeeda |
|---|---|
| **Backend (API + Database)** | Maskaxda nidaamka: xogta oo dhan, xisaabinta lacagta, awoodaha (permissions), amniga. Laamaha oo dhan hal database ayay wadaagaan, sidaa darteed Wajaale isla markiiba wuu arkaa alaabta Boorama looga soo diray. |
| **Website (Dashboard shaqaalaha)** | Shaqaaluhu halkan ayay ka diiwaangeliyaan rakaabka iyo alaabta, ka daabacaan rasiidka, kana arkaan alaabta u imanaysa. Wuxuu ku shaqeeyaa kombiyuutar, tablet iyo taleefan. |
| **SMS (mustaqbalka / Phase 2)** | Fariin u dirta qofka alaabta loo diray: "Alaabtaadu waa timid, koodhku waa CB-4821". |
| **Website macaamiisha (Phase 3, ikhtiyaari)** | Macmiilku wuxuu ka raadin karaa xaaladda alaabtiisa (tracking), ama horay u qabsan karaa kursi. |

**Tech stack la soo jeediyay:** Backend: Node.js (NestJS) ama Laravel · Database: PostgreSQL · Frontend: React/Next.js · Hosting: hal server cloud ah (laamaha oo dhan internet ayay ku xirmaan).
> Internet-ku hadduu go'o: dashboard-ku waa inuu xogta si ku-meel-gaar ah u kaydiyaa, kadibna u diraa (offline mode) — tani waa muhiim Wajaale iyo Boorama.

---

## 2. Afarta Qaybood & Awoodaha (Roles & Permissions)

### Qaybaha
1. **Super Admin (Xafiiska Guud / Mulkiilaha)**
2. **Boorama — Laanta 1**
3. **Laanta Wajaale**
4. **Boorama — Laanta 2** *(xaqiijiyay: Boorama waxay leedahay 2 laamood; waxay wadaagaan safarada Boorama ⇄ Wajaale)*

Laan kasta gudaheeda waxaa jira:
- **Branch Manager (Sub-admin)** — maamulaha laanta
- **Cashier / Karraani** — diiwaangeliya rakaabka iyo alaabta, qaata lacagta
- **Driver (Darawal)** — ikhtiyaari: arka liiska safarkiisa (manifest)

### Shaxda Awoodaha

| Awood | Super Admin | Branch Manager | Cashier |
|---|:---:|:---:|:---:|
| Abuurista laamaha, gaadiidka, wadooyinka (routes) | ✅ | ❌ | ❌ |
| Dejinta qiimaha (tigidhada & alaabta) | ✅ | ❌ (wuu arkaa kaliya) | ❌ |
| Abuurista shaqaalaha | ✅ (dhammaan) | ✅ (laantiisa kaliya) | ❌ |
| Abuurista safarka (trip) & qoondaynta gaariga/darawalka | ✅ | ✅ (laantiisa) | ❌ |
| Diiwaangelinta rakaab + dooran kursi | ✅ | ✅ | ✅ |
| Diiwaangelinta alaab | ✅ | ✅ | ✅ |
| Arkidda alaabta u imanaysa laantiisa | ✅ (dhammaan) | ✅ | ✅ |
| Ku wareejinta alaabta qofka iska leh | ✅ | ✅ | ✅ |
| **Tirtirid / Void** (rasiid la joojiyo) | ✅ | ✅ sabab + ogolaansho | ❌ (codsi kaliya) |
| Discount / qiimo dhimis | ✅ | ✅ xad go'an (tusaale 10%) | ❌ |
| Xiritaanka sanduuqa maalinta (cash closing) | ✅ | ✅ ansixiya | ✅ samee kan isaga |
| Warbixinada (reports) | ✅ dhammaan laamaha | ✅ laantiisa | ✅ shaqadiisa maanta |
| Audit log (cidda waxa samaysay) | ✅ | ✅ laantiisa | ❌ |

> **Xeerka ugu muhiimsan:** shaqaale kasta wuxuu arkaa oo keliya xogta laantiisa. Super Admin kaliya ayaa wax walba arka.

---

## 3. Qaybaha Nidaamka (Modules)

### 3.1 Maamulka Aasaasiga ah (Super Admin)
- **Laamaha:** magac, magaalo, taleefannada (610700, 613053, 063-4500038 …)
- **Wadooyinka (Routes):** Boorama (1 & 2) ⇄ Wajaale — qiimaha tigidhka mid kasta
- **Gaadiidka:** taarikada, nooca (Hiace 14 kursi), **qaabka kuraasta (seat map)**
- **Darawallada:** magac, taleefan, liisan

### 3.2 Safarada (Trips)
- Safar = Route + Gaari + Darawal + Taariikh/Saacad
- Xaaladda: `Furan → Buuxa → Baxay → Gaadhay → La xiray`
- Marka gaarigu baxo, liiska rakaabka iyo alaabta (**manifest**) waa la daabacaa oo waa la xiraa — wax lama beddeli karo Manager la'aantii.

### 3.3 Rakaabka & Doorashada Kursiga
- Shaashad muujinaysa gaariga oo kuraastu ka muuqato: 🟩 bannaan · 🟥 la qaatay · 🟨 hadda la doortay
- Karraaniga ayaa riixa kursiga → geliya **magaca + taleefanka** rakaabka → lacagta → rasiid (koodh leh)
- **Ka hortag laba qof hal kursi:** database-ka kursiga waxaa lagu xiraa (seat lock) inta lacagta la bixinayo; hal laan oo kale ma qaadan karto isla kursiga.
- Ikhtiyaar: ilmo / qiimo gaar ah, kursiga hore (qiimo ka badan haddii la doono)
- Joojin (cancel) → kaliya Manager, sabab la qoro, lacag celin la diiwaangeliyo

### 3.4 Alaabta (Parcels / Cargo) — qaybta ugu muhiimsan
**Diiwaangelinta (laanta laga dirayo):**
- Qofka diraya: magac + taleefan
- Qofka loo dirayo: magac + taleefan *(sharciga 2 ee boodhka)*
- Laanta loo dirayo
- **Nooca alaabta** (liis la doorto): Xawaash/Raashin, Kabo, Dhar, Elektaroonig, Dukumenti, Qalab guri, Daawo, Kale
- Tirada xabbadaha, miisaanka (kg), **qiimaha la sheegay (declared value)**, sharraxaad
- Calaamado: ⚠️ Jajaban kara (fragile) · ❌ Khatar — nidaamku wuu diidaa *(sharciga 4)*
- Sawir alaabta (ikhtiyaari, laakiin waa caddayn haddii khilaaf dhaco)
- Cidda bixinaysa: **qofka diraya (hadda)** ama **qofka qaadanaya (COD — marka la qaato)**

**Natiijada:** koodh gaar ah (tusaale `CB-BOR-000482`) + **label/sticker** lagu dhejiyo alaabta + rasiid.

**Socodka alaabta (Tracking):**
```
La diiwaangeliyay → Gaariga lagu raray → Jidka → Gaadhay laanta → La wareejiyay (qofkii lahaa)
                                                              ↘ Lumay / Dhaawacmay (warbixin)
```
- **Laanta loo dirayo** waxay leedahay shaashad "**Alaabta imanaysa**" — waxay arkaan wixii loogu soo diray, ka hor intaan gaarigu iman.
- Marka gaarigu yimaado: karraanigu wuu **xaqiijiyaa** (scan/riix) xabbad kasta — haddii mid maqan tahay isla markiiba waa la ogaanayaa.
- **Ku wareejinta:** qofka qaadanaya waa inuu keenaa koodhka ama taleefanka la diiwaangeliyay; haddii COD tahay, lacagta ayaa marka hore la qaataa.
- Alaab aan la qaadin 7 maalmood → digniin / khidmad kayd (storage fee).

### 3.5 Xisaabinta Lacagta Automatic-ga ah
Super Admin ayaa hal mar dejiya qiimaha; nidaamka ayaa xisaabiya, karraaniguna **ma beddeli karo**.

**Tigidhka:** `Qiimaha = qiimaha route-ka (+ kursiga hore haddii la doono) − discount la ogolaaday`

**Alaabta:**
```
Qiimaha = Qiimaha aasaasiga nooca
        + (Miisaanka kg × qiimaha kg-ga ee route-ka)
        + Fragile surcharge (haddii ay tahay)
        + Caymis = Declared value × % (ikhtiyaari)
```
Tusaale (tirooyinku waa tusaale): Kabo, 12 kg, Boorama→Wajaale:
`aasaasi $1 + 12 × $0.30 + 0 = $4.60`

- Lacagta noocyada: **Cash (USD / SLSH)**, **Zaad**, **eDahab** — sicirka beddelka (exchange rate) Super Admin ayaa maalin kasta dejiya.
- Lacagtu waxay gashaa sanduuqa (cash drawer) karraaniga diiwaangeliyay.

---

## 4. Sida Lacag Lumis Looga Hortagayo (Money Controls)

1. **Wax lama tirtiri karo** — kaliya *void* sabab leh, Manager ogolaado, audit log-na ku dhaco.
2. **Rasiid kasta wuxuu leeyahay lambar taxane ah** — lambar maqan = su'aal.
3. **Qiimaha nidaamka ayaa go'aamiya**, karraaniga ma qorayo.
4. **Xiritaanka sanduuqa maalinta:** karraanigu wuxuu qoraa lacagta gacantiisa ku jirta → nidaamku wuxuu barbar dhigaa wixii la filayay → farqiga (kordhay/dhimay) Manager iyo Super Admin ayaa arka.
5. **Manifest vs kuraasta:** tirada rakaabka gaariga = tirada tigidhada la iibiyay. Darawal ma qaadi karo rakaab aan tigidh lahayn (hubin la sameeyo).
6. **COD alaabta:** lacagta laanta loo diray ku qaadato waa la raacaa ilaa ay ka gaarto xisaabta shirkadda.
7. **Lacagta laamaha dhexdooda (inter-branch settlement):** warbixin muujinaysa laan kasta inta ay qaaday iyo inta ay ku leedahay laanta kale.
8. **Audit log:** qof kasta, wax kasta, saacad kasta — lama beddeli karo.

---

## 5. Warbixinada (Reports)
- Dakhliga maalinta / toddobaadka / bisha — laan kasta & guud ahaan
- Dakhliga gaari kasta & darawal kasta
- Tirada rakaabka & buuxsanaanta kuraasta (occupancy %)
- Alaabta: la diray, la helay, aan la qaadin, lumay
- Farqiga sanduuqa (shortage) shaqaale kasta
- Void-yada iyo discount-yada (cidda samaysay)

---

## 6. Database-ka (Tables-ka ugu muhiimsan)

| Table | Xogta |
|---|---|
| `branches` | laamaha |
| `users` | shaqaalaha, role, branch_id |
| `routes` | from_branch, to_branch, qiimaha tigidhka, qiimaha kg |
| `vehicles` | taarikada, seat_layout |
| `drivers` | darawallada |
| `trips` | route, vehicle, driver, departure_time, status |
| `bookings` | trip, seat_no, magaca/taleefanka rakaabka, qiimaha, status |
| `parcels` | tracking_code, sender, receiver, from/to branch, trip, category, weight, declared_value, fee, payer (sender/COD), status |
| `parcel_items` | xabbad kasta (haddii ay badan yihiin) |
| `parcel_status_history` | taariikhda socodka alaabta |
| `parcel_categories` | noocyada + qiimaha aasaasiga + is_prohibited |
| `payments` | lacag kasta: nooca (cash/Zaad/eDahab), currency, user, drawer |
| `cash_sessions` | furitaanka/xiritaanka sanduuqa maalinta |
| `pricing_rules` | surcharge-yada, caymiska, discount limits |
| `exchange_rates` | USD ⇄ SLSH |
| `audit_logs` | cidda, maxay, goorma, xogtii hore/cusbayd |

---

## 7. API-ga (Backend Endpoints — kooban)
```
POST   /auth/login
CRUD   /branches, /users, /routes, /vehicles, /drivers        (Super Admin)
GET    /trips?date=&route=          POST /trips               PATCH /trips/:id/status
GET    /trips/:id/seats             (khariidadda kuraasta)
POST   /bookings                    POST /bookings/:id/void
POST   /parcels/quote               (xisaabi qiimaha ka hor)
POST   /parcels                     GET  /parcels/:code
GET    /parcels/incoming?branch=    (alaabta imanaysa)
POST   /parcels/:id/load | /arrive | /deliver
POST   /cash-sessions/open | /close
GET    /reports/...
```

---

## 8. Marxaladaha Dhismaha (Phases)

| Phase | Waxa ku jira |
|---|---|
| **1 — MVP** | Login + roles, laamaha, routes, gaadiidka, safarada, rakaab + kursi, alaab + tracking + label, xisaabinta automatic, rasiid daabacan, cash closing, warbixino aasaasi ah |
| **2** | SMS, Zaad/eDahab, offline mode, scan barcode, inter-branch settlement |
| **3** | Website macaamiisha (tracking + online booking), app darawalka |

---

## 9. Su'aalo u Baahan Xaqiijin (ka hor dhismaha)
1. ~~Laanta 3aad~~ → xaqiijiyay: Boorama Laanta 2.
2. Gaari kasta immisa kursi buu leeyahay (Hiace 14?) — qaabka kuraasta?
3. Qiimaha tigidhka iyo alaabta hadda (USD mise SLSH)? Alaabta ma miisaan baa lagu xisaabiyaa mise xabbad?
4. COD (lacagta marka la qaato) ma la isticmaalaa hadda?
5. Rasiidka: printer thermal ah ma haysaan?
6. Zaad/eDahab ma rabtaan Phase 1?
