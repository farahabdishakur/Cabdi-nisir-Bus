# Sida nidaamka loogu kiciyo kombiyuutarkaaga (VS Code)

**Docker looma baahna.** VS Code ayaa wax walba kiciya: **backend-ka** (database-kiisuna wuu la socdaa — PostgreSQL ma rakibaysid), **website-ka**, iyo laba daaqadood oo gooni ah: **Super Admin** iyo **Shaqaalaha**.

## 1. Rakib (hal mar)

| Barnaamij | Halka laga soo dejiyo | Fiiro |
|---|---|---|
| **Node.js 22 LTS** | https://nodejs.org/ → *Download Node.js (LTS)* | Rakib → Next, Next … (wax ha beddelin) |
| **VS Code** | https://code.visualstudio.com/ | |
| Microsoft Edge | Windows-ka wuu ku jiraa | Daaqadaha Super Admin / Shaqaalaha |

> Node.js kadib **kombiyuutarka dib u kici** (ama VS Code xir oo fur) si `node` iyo `npm` loo helo.

## 2. Soo deji code-ka

https://github.com/farahabdishakur/Cabdi-nisir-Bus/archive/refs/heads/ccr-6915eb85-u3sjbx.zip
→ soo deji → midig-riix → **Extract All** → tusaale `C:\CabdinasirBus`.

(Git: `git clone -b ccr-6915eb85-u3sjbx https://github.com/farahabdishakur/Cabdi-nisir-Bus.git`)

## 3. Kici — HAL AMAR (ugu fudud)

**Ikhtiyaar A:** folder-ka laba jeer riix **`KICI.bat`**.

**Ikhtiyaar B:** VS Code terminal-ka (folder-ka ugu sarreeya — halka `KICI.bat` ku jiro):
```
npm run dev
```
Wax walba isaga ayaa qabanaya: `npm install` (markii ugu horreysay 3–10 daqiiqo) → backend + database → website → browser-ka ayaa furmaya.
Marka uu qoro **✓ DIYAAR** → http://localhost:3001 . Daaqadda ha xirin; jooji: **Ctrl + C**.

> `cd` looma baahna. Haddii PowerShell uu yiraahdo *"running scripts is disabled"* → `npm.cmd run dev`.

## 3b. VS Code Run and Debug (ikhtiyaari)

1. VS Code → **File → Open Folder…** → dooro galka (kan ay ku jiraan `cabdinasir-bus-backend` iyo `cabdinasir-bus-web`).
   Haddii la weydiiyo *"Do you trust the authors?"* → **Yes, I trust**.
2. Bidixda riix **Run and Debug** (▷🐞) ama `Ctrl+Shift+D`.
3. Liiska kor ka dooro **▶ Kici dhammaan (Backend + Website + Super Admin + Shaqaalaha)** → riix **▷** (ama `F5`).

Markii ugu horreysay **3–5 daqiiqo** (npm install + database). Kadib:

| Waxa furmaya | Cinwaanka |
|---|---|
| Terminal **⚙️ Backend** (API) | http://localhost:3000 · docs: http://localhost:3000/api/docs |
| Terminal **🌐 Website** | http://localhost:3001 |
| Daaqad **👑 Super Admin** (Edge, gooni) | taleefanka hore ayaa ku qoran — geli password-ka |
| Daaqad **👤 Shaqaalaha** (Edge, gooni) | karraanigii Boorama 1 |

Daaqad kasta **login-keeda gooni ah ayay leedahay** → Super Admin iyo karraani isku mar ayaad u tijaabin kartaa.
**Jooji:** badhanka ⏹ (Stop) ee kor ka muuqda.

## 4. Akoonnada tijaabada

| Doorka | Taleefan | Password |
|---|---|---|
| **Super Admin** | `0630000000` | `ChangeMe123!` → password cusub ayaa la weydiinayaa |
| Maamulaha Boorama 1 | `0631000001` | `Demo1234` |
| Karraani Boorama 1 | `0631000002` | `Demo1234` |
| Maamulaha Wajaale | `0632000001` | `Demo1234` |
| Karraani Wajaale | `0632000002` | `Demo1234` |

Xogta tijaabada: 3 laamood, wadooyinka, gaadiid (BUS-1…4 = 10 kursi, darawal kasta), noocyada alaabta, sicirka SLSH.
Tigidhka: lambarka warqadda tusaale `BO1-1001`, `BO1-1002` …

## 5. Waxa la tijaabiyo (talo)

1. **Super Admin:** Maamul → Dejinta (logo, buugga tigidhada warqadda) · Gaadiidka (naqshadeeyaha kuraasta) · Laamaha (Zaad) · Wadooyinka & qiimaha
2. **Maamulaha Boorama 1** (daaqadda Shaqaalaha → ka bax → `0631000001`): 🚏 Safka gaadiidka → *Bilow maalinta* · 💵 Sanduuqa → fur
3. **Karraaniga:** Sanduuqa fur → Tigidh iib (lambarka warqadda) · Alaab dir (sawir) · Tigidhada & ballamaha
4. **Maamulaha:** *Gaarigu wuu baxay* → kan xiga ayaa iib u furmaya
5. **Wajaale:** Alaabta imanaysa → xaqiiji → Alaab wareeji (PIN)
6. **Xisaabaadka:** buugga laanta, faa'iido & khasaare, mushaharka darawallada
7. Macmiilka (login la'aan): http://localhost:3001/track · http://localhost:3001/schedule

## 6. Dhibaatooyin

| Dhibaato | Xal |
|---|---|
| `'npm' is not recognized` | Node.js lama rakibin ama kombiyuutarka dib uma kicin |
| `npm.ps1 cannot be loaded … running scripts is disabled` | PowerShell ayaa xiran: terminal-ka ku qor `npm.cmd` halkii `npm` (tusaale `npm.cmd install`), ama hal mar: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` → `Y` |
| *Port 3000/3001 is already in use* | Wax kale ayaa isticmaalaya — jooji (ama kombiyuutarka dib u kici) |
| Login: "isku day badan" | 5 isku day oo khaldan daqiiqaddii → sug 1 daqiiqo (ilaalin) |
| Xogta tijaabada bilow cusub | *Terminal → Run Task → 🧹 Tirtir xogta tijaabada* → mar kale kici |
| Edge ma furmo | Gacanta fur http://localhost:3001 |

Terminal-ka ⚙️ Backend ama 🌐 Website haddii khalad cas ka muuqdo → **sawir ka qaad oo u dir Claude**.

## 7. Docker (ikhtiyaari — server-ka / iibka)

Docker Desktop haddii uu kuu shaqeeyo: `START-WINDOWS.bat` (ama *Run Task → 🐳 Docker: kici*) → isla http://localhost:3001.
Server-ka dhabta ah (VPS): `cabdinasir-bus-backend/docs/DEPLOYMENT.md` — `docker-compose.prod.yml` + Caddy (HTTPS).

> ⚠️ Kani waa **tijaabo** — password-yada iyo sirta halkan lagama isticmaalo server-ka dhabta ah.
