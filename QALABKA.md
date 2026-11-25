# Qalabka loo baahan yahay — Cabdinasir Bus

Liiska qalabka shaqada lagu bilaabayo: 3 laamood (Boorama 1, Boorama 2, Wajaale) iyo xafiiska guud.
**Qiimayaashu waa qiyaas** — ka hubi suuqa Hargeysa/Boorama ka hor intaadan iibsan.

## 1. Laan kasta (×3)

| # | Qalab | Tirada | Faahfaahin | Qiyaas (USD) |
|---|---|---|---|---|
| 1 | **Laptop** (ama kombiyuutar desktop) | 1–2 | Karraaniga (+ maamulaha haddii uu rabo). Laptop ayaa ka fiican, maxaa yeelay batteriga ayuu ku shaqeeyaa marka korontadu go'do. Ugu yaraan: Core i3 / Ryzen 3, RAM 8GB, SSD 256GB, Windows 10/11, **Google Chrome**. | 250–400 mid kasta |
| 2 | **Printer rasiid 80mm (thermal)** | 1 | USB, *auto-cutter*, ESC/POS (tusaale Xprinter XP-80C, Epson TM-T20). Wuxuu daabacaa tigidhka, rasiidka alaabta, label-ka iyo rasiidka darawalka. | 60–120 |
| 3 | **Warqadda rasiidka 80mm × 80m** | 5–6 duub bishii | Rasiid kasta ≈ 10–12 cm. 100 rasiid maalintii → duub kasta ≈ 6–7 maalmood. Kartoon (50 duub) iibso. | 0.7–1.2 duubkii |
| 4 | **Taleefan Android** | 1 | Kamarad wanaagsan — **sawirada iyo video-ga caddaynta alaabta**, Zaad/eDahab, iyo internet kayd (hotspot). | 120–200 |
| 5 | **Router 4G (MiFi)** + SIM | 1 | Internet-ka koowaad (Telesom ama Somtel). | 30–60 + xirmo bil kasta |
| 6 | **SIM labaad (shirkad kale)** | 1 | Internet kayd: haddii shirkadda koowaad go'do, taleefanka ama router-ka ayaa SIM-kan lagu shidaa. | 5 + xirmo |
| 7 | **UPS 650–1000VA** | 1 | Router + printer (+ desktop haddii la isticmaalo) ha ku shaqeeyaan inta korontadu go'an tahay. | 60–120 |
| 8 | *Ikhtiyaari:* **Scanner QR/barcode USB** | 1 | Akhrinta QR-ka rasiidka alaabta marka ay timaado ama la dhiibayo (degdeg). | 25–40 |
| 9 | *Ikhtiyaari:* **Sanduuq lacageed (cash drawer)** | 1 | Wuxuu ku xirmaa printer-ka (RJ11), si toos ah ayuu u furmaa marka rasiid la daabaco. | 40–60 |
| 10 | *Ikhtiyaari:* **Printer label 80×50mm** | 1 | Sticker-ka alaabta (QR + magaalada). Haddii aan la iibsan, label-ka waxaa lagu daabacaa printer-ka rasiidka oo cajalad ayaa lagu dhejiyaa. | 80–150 |

**Laan kasta (qalabka muhiimka ah 1–7):** qiyaas ahaan **$550–950**.

## 2. Xafiiska guud (Super Admin)

| Qalab | Faahfaahin | Qiyaas (USD) |
|---|---|---|
| Laptop | Xisaabaadka, warbixinada, maamulka | 300–450 |
| Printer A4 (laser) | Manifest-ka safarka, warbixinada | 120–200 |
| Taleefan | Ogeysiisyada (SMS digniin), Zaad | — (kan hadda jira) |

## 3. Server-ka iyo adeegyada (bil kasta)

| Adeeg | Faahfaahin | Qiyaas |
|---|---|---|
| **VPS (server cloud)** | 2 vCPU, 4GB RAM, 80GB disk (tusaale Hetzner CX22 ama DigitalOcean). Nidaamka oo dhan halkan ayuu ku shaqeeyaa; laamaha browser-ka ayay ka galaan. | $6–12 / bishii |
| **Domain** | tusaale `cabdinasirbus.com` — HTTPS (qufulka cagaaran) si toos ah ayuu u shaqeeyaa | $10–15 / sannadkii |
| **Backup meel kale** | nuqulka database-ka + sawirada (tusaale Backblaze B2 / bucket) | $1–5 / bishii |
| **SMS gateway** | Telesom/Somtel bulk SMS (PIN-ka alaabta, ballanta, cabashada) | qiimaha SMS kasta |

Software lama iibsanayo: wax kasta waa **browser (Chrome)** — wax lama rakibayo. Taleefanka/laptop-ka waxaa lagu dari karaa icon (PWA).

## 4. Internet-ku haddii uu go'o — sidee buu u shaqeeyaa?

| Shaqo | Internet la'aan | Sababta |
|---|---|---|
| **Alaab diiwaangelin + rasiid + PIN** | ✅ **Wuu shaqeeyaa** — kombiyuutarka ayuu ku kaydsamaa, marka internet-ku soo noqdo si toos ah ayuu u diraa (koodhka dhabta ah + SMS) | Alaab kasta waa mid gooni ah; isku dhac ma jiro |
| Bogga / login-ka (haddii hore loo furay) | ✅ Wuu furmaa (cache) — fadhigu ma dhaco | |
| **Tigidh iibin / ballan / safka gaadiidka** | ❌ Internet ayuu u baahan yahay | Kursiga waxaa wadaaga **Boorama 1 iyo Boorama 2**: haddii labada laamood internet la'aan iibiyaan, isla kursiga laba qof ayaa la siin karaa. Server-ka ayaa go'aamiya kursiga cidda leh. |
| Lacag bixinta, wareejinta, warbixinada | ❌ Internet | Lacagtu waa inay hal meel ku qoran tahay (lumis la'aan) |

**Talada si aan shaqadu u istaagin:**
1. **Laba internet** laan kasta: router 4G (shirkadda A) + SIM shirkadda B ee taleefanka → haddii mid go'o, laptop-ka hotspot-ka taleefanka ku xir (30 ilbiriqsi).
2. **UPS / laptop** — korontadu go'do, internet-ku iyo kombiyuutarku way socdaan.
3. Haddii labaduba go'aan: alaabta offline sii wad; tigidhada si ku-meel-gaar ah warqad ugu qor, kadib nidaamka geli (kursiga gaariga safka hore).
4. **Mustaqbalka (haddii aad rabto):** iib tigidh offline — laan kasta waxaa loo qoondeeyaa kuraas gaar ah gaariga buuxsamaya (tusaale Boorama 1: 1–5, Boorama 2: 6–10), sidaa darteed laba laamood isku kursi ma iibin karaan. Sheeg haddii aad rabto in la dhiso.

## 5. Ka hor maalinta koowaad (checklist)

- [ ] Server (VPS) + domain → nidaamka la shido (DEPLOYMENT.md)
- [ ] Super Admin: password cusub, **logo**, macluumaadka shirkadda, sicirka SLSH maanta
- [ ] Laamaha: taleefannada + lambarada **Zaad / eDahab** laan kasta
- [ ] Wadooyinka + **qiimaha tigidhka** iyo alaabta (kg, nooc kasta)
- [ ] **Gaadiidka** (taarikada + qaabka kuraasta — naqshadeeyaha) + **darawallada** (darawalka caadiga ah ee gaari kasta) + qaabka mushaharka darawal kasta
- [ ] Shaqaalaha: karraani + maamule laan kasta (password ku-meel-gaar ah)
- [ ] Printer-ka: tijaabi rasiid (Chrome → Print → 80mm, margins: none)
- [ ] Tababar: 1 maalin (iib tigidh, safka, alaab, wareejin, sanduuq xiritaan)
