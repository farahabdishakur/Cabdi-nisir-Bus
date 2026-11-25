# Sida nidaamka loogu tijaabiyo kombiyuutarkaaga

Wax walba (database + backend + website + xog tijaabo ah) **hal riix** ayay ku kacaan.

## 1. Rakib (hal mar)

| Barnaamij | Halka laga soo dejiyo |
|---|---|
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ — rakib, kici, sug ilaa uu "Engine running" (cagaar) noqdo |
| **VS Code** | https://code.visualstudio.com/ |
| **Git** *(ikhtiyaari)* | https://git-scm.com/download/win |

## 2. Soo deji code-ka

**Habka fudud (ZIP):**
https://github.com/farahabdishakur/Cabdi-nisir-Bus/archive/refs/heads/ccr-6915eb85-u3sjbx.zip
→ soo deji → *Extract All* (tusaale `C:\CabdinasirBus`).

**Ama Git:**
```
git clone -b ccr-6915eb85-u3sjbx https://github.com/farahabdishakur/Cabdi-nisir-Bus.git
```

## 3. Kici

- **Windows:** galka laba jeer riix **`START-WINDOWS.bat`** — markii ugu horreysay 5–10 daqiiqo (wuu dhisayaa), kadibna browser-ka ayuu furayaa.
- **VS Code:** *File → Open Folder* → galka → `Ctrl+Shift+B` (ama *Terminal → Run Task → ▶ Kici nidaamka*).
- **Mac/Linux:** `./start.sh`

| Meesha | Cinwaanka |
|---|---|
| **Website-ka** | http://localhost:3001 |
| **Backend (API docs)** | http://localhost:3000/api/docs |
| Raadinta alaabta (macmiilka) | http://localhost:3001/track |
| Jadwalka dadweynaha | http://localhost:3001/schedule |

## 4. Akoonnada tijaabada

| Doorka | Taleefan | Password |
|---|---|---|
| **Super Admin** | `0630000000` | `ChangeMe123!` → password cusub ayaa la weydiinayaa |
| Maamulaha Boorama 1 | `0631000001` | `Demo1234` |
| Karraani Boorama 1 | `0631000002` | `Demo1234` |
| Maamulaha Wajaale | `0632000001` | `Demo1234` |
| Karraani Wajaale | `0632000002` | `Demo1234` |

Xogta tijaabada: 3 laamood, wadooyinka, 5 gaari (BUS-1…4 = 10 kursi, darawal kasta), noocyada alaabta, sicirka SLSH.

## 5. Waxa la tijaabiyo (talo)

1. **Super Admin:** Maamul → Dejinta → logo · Gaadiidka → naqshadeeyaha kuraasta · Laamaha (lambarada Zaad) · Wadooyinka & qiimaha
2. **Maamulaha Boorama 1:** 🚏 Safka gaadiidka → *Bilow maalinta* · 💵 Sanduuqa → fur
3. **Karraaniga:** Iibi tigidh (lambarka warqadda `BO1-1001`) · Alaab dir (sawir) · Sanduuqa
4. **Maamulaha:** *Gaarigu wuu baxay* → kan xiga ayaa iib u furmaya
5. **Wajaale:** Alaabta imanaysa → xaqiiji → wareeji (PIN)
6. **Xisaabaadka:** buugga laanta, P&L, mushaharka darawallada
7. Buugga tigidhada warqadda: Maamul → Dejinta → *Buugga tigidhada warqadda*

## 6. Jooji / bilow cusub

- **Jooji:** `STOP-WINDOWS.bat` (xogta waa la kaydiyaa)
- **Xogta oo dhan tirtir (bilow cusub):** VS Code → Run Task → *🧹 Tirtir xogta tijaabada*

> ⚠️ Kani waa **tijaabo** — passwords-ka iyo sirta `docker-compose.demo.yml` lagama isticmaalo server-ka dhabta ah (eeg `cabdinasir-bus-backend/docs/DEPLOYMENT.md`).
> Login-ka: 5 isku day oo khaldan daqiiqaddii → sug 1 daqiiqo (ilaalin).
