# Cabdinasir Bus — Sida Online Loogu Dhigo (VPS + Domain)

Kadib tallaabooyinkan: website-ka iyo backend-ku waxay ku noolaanayaan internet-ka (**https://cabdinasirbus.com**),
laamaha (Boorama 1, Boorama 2, Wajaale) iyo **Super Admin-ka (telefoon)** meel kasta way ka galayaan, oo **app ahaan ayaa loo rakibi karaa** (PC + telefoon).
Internet-ku marka go'o: alaab + tigidh (qoondada laanta) way socdaan; marka uu soo noqdo si toos ah ayay u gudbaan.

---

## 1. Waxa la iibsanayo (≈ $15 bishii)

| Shay | Halka laga iibsado | Qiimaha | Talo |
|---|---|---|---|
| **Domain** (magaca website-ka) | Namecheap · Cloudflare Registrar · Porkbun | ~$10–15 sannadkii | `cabdinasirbus.com` (ama `.so` / `.net` haddii la qaatay) |
| **VPS** (server) | **Hetzner Cloud** (CPX21/CX32) · DigitalOcean · Contabo | $6–15 bishii | **Ubuntu 24.04**, 2 vCPU, 4 GB RAM, 40+ GB disk, goobta **Germany/Finland** ama Frankfurt |

Lacag bixinta: kaar Visa/Mastercard (ama PayPal — DigitalOcean/Namecheap way aqbalaan).

Marka VPS-ka la iibsado waxaad helaysaa: **IP** (tusaale `65.21.10.20`) iyo password-ka `root` (ama SSH key).

---

## 2. Domain-ka ku xir server-ka (DNS)

Domain-ka dashboard-kiisa → **DNS / Advanced DNS** → ku dar laba record:

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| A | `@` | IP-ga server-ka | Automatic |
| A | `api` | IP-ga server-ka | Automatic |

Sug 5–30 daqiiqo. Hubin (PC-gaaga): `ping cabdinasirbus.com` → waa inuu muujiyaa IP-ga server-ka.

---

## 3. Server-ka geli oo kici (hal amar)

PC-gaaga (Windows: **PowerShell**):

```bash
ssh root@65.21.10.20          # IP-gaaga ku beddel, password-ka geli
```

Server-ka dhexdiisa:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/farahabdishakur/Cabdi-nisir-Bus.git /opt/cabdinasir
cd /opt/cabdinasir
sudo bash cabdinasir-bus-backend/scripts/setup-server.sh cabdinasirbus.com
```

> Repo-gu haddii uu private yahay, GitHub wuxuu weydiinayaa username + **token** (GitHub → Settings → Developer settings → Personal access tokens). Token-ka **chat-ka ha ku qorin** — kaliya server-ka.

Script-ku (10–15 daqiiqo) wuxuu sameeyaa:
1. Docker + firewall (kaliya 22, 80, 443 furan)
2. Sirta cusub (`.env`, password-ada database & JWT — random)
3. Database + backend + website + **HTTPS** (shahaado bilaash ah, automatic)
4. Xogta aasaasiga (laamaha, Super Admin)
5. Backup maalin kasta 23:00 (30 maalmood) → `/var/backups/cabdinasir`

Dhammaadka wuxuu daabacaa:

```
✅ Cabdinasir Bus waa online!
   Website:  https://cabdinasirbus.com
   Super Admin: 0630000000 / Cb-xxxxxxxxxx9
```

**Password-ka Super Admin qor meel ammaan ah**, gal, kadibna isla markiiba beddel.

---

## 4. App ahaan u rakib

| Qalab | Sida |
|---|---|
| **PC (Chrome / Edge)** | Fur `https://cabdinasirbus.com` → badhanka **"📲 Rakib app-ka"** (sidebar) ama astaanta ⊕ ee address bar-ka → *Install*. Desktop-ka icon-ka baska ayaa ka soo baxaya. |
| **Android (Chrome)** | Fur link-ga → ⋮ menu → **"Add to Home screen" / "Install app"** |
| **iPhone (Safari)** | Fur link-ga → Share ⬆️ → **"Add to Home Screen"** |

App-ku wuxuu u furmaa sida app caadi ah (address bar la'aan). Version cusub marka la soo saaro si toos ah ayuu isu cusboonaysiiyaa.

---

## 5. Kadib (hal mar)

1. Super Admin → **Maamul**: logo, laamaha (Zaad/eDahab lambarada), qiimayaasha dhabta ah, shaqaalaha, gaadiidka + kuraasta, darawalada.
2. Laan kasta hal mar **online** ha furto app-ka (xogta offline-ka ayuu kaydiyaa).
3. Monitoring bilaash ah: **UptimeRobot** → `https://api.cabdinasirbus.com/api/v1/health` (SMS/email haddii server-ku dhaco).

## 6. Cusboonaysiin (version cusub)

```bash
ssh root@<IP>
cd /opt/cabdinasir && git pull
cd cabdinasir-bus-backend && docker compose -f docker-compose.prod.yml up -d --build
```

## 7. Dhibaatooyin

| Calaamad | Xal |
|---|---|
| HTTPS ma shaqeeyo / "not secure" | DNS weli ma gaadhin → sug, kadib `docker compose -f docker-compose.prod.yml restart caddy` |
| Website-ku ma furmo | `docker compose -f docker-compose.prod.yml ps` (dhammaan "running") · `... logs --tail 50 api` |
| Password-ka Super Admin waa la illaawey | `grep SEED_SUPER_ADMIN_PASSWORD /opt/cabdinasir/cabdinasir-bus-backend/.env` (kaliya haddii aan weli la beddelin) |
| Backup | `ls -lh /var/backups/cabdinasir` |

Faahfaahin farsamo: `cabdinasir-bus-backend/docs/DEPLOYMENT.md`.
