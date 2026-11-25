# Xeerarka Naqshadda & Isticmaalka (UI Rules)

Isticmaalayaashu waa karraaniyo xafiis mashquul ah ku jira, macmiilna hor taagan yahay. **Degdeg, cad, khalad yar.**

## 1. Mabaadi'da
- **Ficilka ugu badan = 1 riix:** dashboard-ka karraaniga wuxuu leeyahay 3 badhan oo waaweyn: **Tigidh Iib · Alaab Dir · Alaab Wareeji**.
- **Keyboard:** foom kasta Tab/Enter ku dhammaystirma; `F2` = tigidh cusub, `F3` = alaab cusub, `/` = raadi koodh.
- **Raadin meel kasta:** topbar-ka — koodh alaab, lambar rasiid, ama taleefan.
- Foom kasta wuxuu muujiyaa **qiimaha wadarta ah** si weyn ka hor badhanka "Bixi".
- Fariimaha khaladka: Af-Soomaali fudud, waxa la sameeyo ku jiraan ("Kursigan waa la qaatay — dooro mid kale").

## 2. Midabada (brand-ka shirkadda — boodhka)
| Token | Isticmaal |
|---|---|
| `--brand-red` (#B3202A ku dhow) | badhamada muhiimka, header |
| `--brand-navy` (#1F2A6B ku dhow) | sidebar, cinwaanada |
| Cagaar | kursi bannaan, la wareejiyay, lacag dhammaystiran |
| Casaan | kursi la qaatay, void, variance taban |
| Jaalle | kursi hadda la doortay, sugaya, digniin |
- Dark mode: Phase 2. Kala-duwanaanshaha midabada (contrast) WCAG AA.
- Xaaladaha weligood midab keliya kuma muujin — had iyo jeer qoraal/icon la socda.

## 3. Luqadda
- Default: **Af-Soomaali**. Badhanka beddelka luqadda topbar-ka.
- Taariikhda: `24/11/2026 08:30` · Waqtiga: `Africa/Mogadishu`.
- Lacagta: `$4.60` · `46,000 SLSH` — labadaba la muujiyaa marka cash la qaadanayo.
- Taleefannada: qaabka `063 4500038`; validation: lambarada Somaliland (063/065/066…).

## 4. Khariidadda Kuraasta (Seat Map)
- Waxay u ekaataa gaariga dhabta ah (darawalka bidix/midig sida gaariga), kursi kasta lambar leh.
- Riix kursi → hold 3 daqiiqo (saacad tirinaysa ayaa muuqata) → foomka rakaabka.
- Seat map-ku wuxuu is-cusboonaysiiyaa 5 ilbiriqsi kasta (ama SSE) si laamaha kale iibkooda loo arko.
- Kursiga la qaatay: hover/riix → magaca rakaabka + rasiidka (Manager kaliya).

## 5. Daabacaadda
| Waxa | Cabbir | Waxa ku jira |
|---|---|---|
| Rasiidka tigidhka | 80mm thermal | logo, lambar rasiid, safarka, kursiga, magaca, qiimaha, karraaniga, QR |
| Rasiidka alaabta | 80mm | tracking code, diraha/qaataha, nooca, kg, qiimaha, cidda bixinaysa (COD), shuruudaha 5-ta |
| Label/sticker alaabta | 80×50mm | barcode/QR tracking code, laanta loo dirayo (far waaweyn), qaataha + taleefan, xabbad `1/3` |
| Manifest safarka | A4 | rakaabka + alaabta, saxiixa darawalka & karraaniga |
- Daabacaadda kadib rasiid si toos ah — badhan "Dib u daabac" (re-print waa la diiwaangeliyaa).

## 6. Offline (waa la dhisay)
- Calaamad topbar: 🟢 Online / 🔴 Offline + tirada sugaysa.
- Offline: alaab diiwaangelin & rasiid ku-meel-gaar ah (`OFFLINE-xxxx`, PIN client-ka, qiimaha "≈ qiyaas") waa la oggol yahay; **tigidh iib offline lama oggola** (kursiga laba jeer ayaa la iibin karaa).
- Rasiidka offline isla bogga ayaa lagu daabacaa (`.print-area`) — internet la'aan tab cusub lama furi karo.
- Bogga reload offline: service worker-ka ayaa bixiya; user-ka tab-kan waa la sii hayaa (sessionStorage — token ma aha).
- Bogga `/offline`: sugaya · la diray (koodh dhab ah) · khalad (sabab) · dib u daabac.
- Marka internet-ku soo noqdo: queue-ga waxaa lagu diraa `Idempotency-Key`.

## 7. Helitaanka (Accessibility)
- Badhamada ≥ 44px taleefanka · far ugu yar 14px · focus ring muuqda.
- Foom kasta label leh (placeholder kaliya ma aha).
