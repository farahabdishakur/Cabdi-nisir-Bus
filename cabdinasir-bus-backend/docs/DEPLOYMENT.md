# Internet-ka, Server-ka & Shaqada Offline — Cabdinasir Bus

Dokumentigan wuxuu sharxayaa **halka nidaamku ku noolaanayo**, **sida laamuhu ugu xirmaan internet-ka**, **waxa dhaca marka internet-ku go'o**, iyo **sida xogta loo ilaaliyo**.

---

## 1. Sawirka Guud

```
        ┌──────────────── Internet ────────────────┐
        │                                          │
 [Laanta Boorama]   [Laanta Wajaale]   [Laanta 3aad]      [Super Admin — meel kasta, taleefan/laptop]
  PC + printer       PC + printer       PC + printer
  Fiber + 4G backup  Fiber + 4G backup  Fiber + 4G backup
        │                  │                  │                    │
        └──────────── HTTPS (qarsoon) ────────┴────────────────────┘
                                   │
                     ┌─────────────▼──────────────┐
                     │  Cloud Server (VPS)         │
                     │  Caddy (HTTPS)              │
                     │  ├─ app.cabdinasirbus.com → Website (cabdinasir-bus-web)
                     │  └─ api.cabdinasirbus.com → Backend API (repo-gan)
                     │  PostgreSQL (database)      │
                     │  Backup maalinle → meel kale│
                     └─────────────────────────────┘
                                   │
                         SMS provider (Telesom/Somtel)
```

**Hal server, hal database.** Laan kasta waxay isticmaashaa browser (Chrome) — software lagu rakibo laamaha ma jiro.
Sidaas darteed Wajaale isla markiiba way aragtaa alaabta Boorama looga soo diray.

---

## 2. Halkee Server-ku Joogaa? — Go'aan

| Ikhtiyaar | Faa'iido | Dhibaato | Go'aan |
|---|---|---|---|
| **Cloud VPS** (Hetzner, DigitalOcean, AWS…) | Koronto & internet 24/7, backup fudud, laamaha oo dhan si siman ayay u gaaraan | Lacag bille ah (~$10–25) | ✅ **La doortay** |
| Server xafiiska Boorama dhexdiisa | Lacag bille ah ma jirto | Koronto/internet Boorama markay go'aan **dhammaan laamaha way istaagaan**; tuugo/dab; IP go'an + port-forwarding | ❌ |

**Cabbirka server-ka (bilowga):** 2 vCPU · 4 GB RAM · 40 GB SSD · Ubuntu 24.04 — wuxuu qaadi karaa kumanaan tigidh/alaab maalintii.
**Goobta:** xarun u dhow Geeska Afrika (Frankfurt, Nairobi/Johannesburg haddii la heli karo) — latency ~100–200ms waa ku filan.

---

## 3. Xiriirka Laamaha (Internet-ka Xafiisyada)

Laan kasta waxay u baahan tahay:
1. **Internet aasaasi:** fiber / wireless (Telesom, Somcable…).
2. **Internet kayd (backup):** router 4G (SIM kale — shirkad kale haddii suurtagal) oo **si automatic ah ugu wareega** marka kan hore go'o (*dual-WAN / failover router*). Ugu yaraan: taleefan hotspot.
3. **UPS** (koronto kayd) router-ka + kombiyuutarka + printer-ka — 30–60 daqiiqo.
4. **Isticmaalka xogta:** nidaamku waa fudud (~50–150 MB maalintii laan kasta) — 4G backup waa raqiis.

> Xeer: **internet-ka kayd ayaa ka muhiimsan offline mode.** Offline mode waa shabakadda badbaadada ugu dambaysa.

---

## 4. Marka Internet-ku Go'o — Offline Mode

Website-ku (PWA) wuxuu kaydiyaa xogta tixraaca (`GET /sync/bootstrap`): laamaha, routes, qiimayaasha, noocyada alaabta, sicirka, safarada maanta.

| Ficil | Offline? | Sababta |
|---|:-:|---|
| **Alaab diiwaangelin** + rasiid + label | ✅ | Koodh ku-meel-gaar ah (`OFFLINE-…`) + PIN client-ka; marka internet-ku soo noqdo → `POST /sync/parcels` (Idempotency-Key — laba jeer ma noqoto) |
| Qiimaha alaabta xisaabi | ✅ | Qaacidada + qiimayaasha la kaydiyay (server-ka ayaa mar kale hubiya marka sync la sameeyo) |
| Raadi alaab hore loo kaydiyay | ✅ (kaliya wixii la kaydiyay) | |
| **Tigidh iib (kursi)** | ❌ | Laba laamood isla kursiga ayay iibin karaan — server-ka kaliya ayaa damaanad qaadi kara |
| **Alaab wareejin** | ❌ | Laba jeer ayaa la wareejin karaa; PIN-ka server-ka ayaa hubiya |
| Void, discount, xiritaanka sanduuqa | ❌ | Ansixin & lacag — server-ka |

**Haddii tigidh la iibiyo internet la'aan (xaalad degdeg):** qor buug gacan + rasiid gacan, kadib marka internet-ku soo noqdo geli nidaamka (Manager ayaa xaqiijiya). Tani waa xeer shaqo, ma aha mid software.

**Marka sync la sameeyo:** natiijada item kasta (`ok` / `error`) ayaa soo laabata — tusaale alaab mamnuuc ah ama route aan jirin → karraanigu wuu arkaa oo wuu saxaa.

---

## 5. Marka Server-ka Laftiisu Dhaco

- **Monitoring:** adeeg bilaash ah (UptimeRobot / BetterStack) oo 1 daqiiqo kasta wacaya `https://api.cabdinasirbus.com/api/v1/health` → SMS/email Super Admin-ka haddii uu dhaco.
- Docker `restart: unless-stopped` → haddii API-gu dhaco, si automatic ah ayuu u kacaa.
- Laamuhu inta uu dhacsan yahay: offline mode (alaab) + buug gacan (tigidh).

---

## 6. Backup & Soo Celin

| Waxa | Sida | Goorma |
|---|---|---|
| Database | `scripts/backup.sh` (pg_dump) → `/var/backups/cabdinasir` | Maalin kasta 23:00 (cron) |
| Nuqul meel kale | `OFFSITE_CMD` (rclone → Backblaze B2 / S3 / Google Drive) | Isla markaas |
| Sawirada alaabta | `uploads/` → rclone sync | Maalin kasta |
| Hayn | 30 maalmood (server) · 90+ maalmood (offsite) | |
| **Tijaabi soo celinta** | `scripts/restore.sh` server tijaabo ah | **Bil kasta** — backup aan la tijaabin ma aha backup |

Provider-ka VPS-ka snapshot toddobaadle ah ayaa sidoo kale la daaraa.

---

## 7. Amniga Server-ka

- Firewall: kaliya **22 (SSH, key-only), 80, 443** furan. PostgreSQL **lama soo bandhigo** internet-ka.
- SSH: password login waa la xiraa; fail2ban.
- `.env` production: secrets cusub (`openssl rand -base64 48`), `NODE_ENV=production` — server-ku wuu diidaa inuu kaco haddii secrets-ku yihiin kuwa default-ka ah.
- Cusboonaysiin: `unattended-upgrades` (Ubuntu security patches).
- CORS: domain-ka website-ka oo keliya (`CORS_ORIGIN`).
- Rate limiting (300 req/daqiiqo IP kasta; login 5/daqiiqo) · akoon xir 5 isku day kadib.

---

## 8. Dejinta Server-ka (Tallaabooyin)

```bash
# 1. Server Ubuntu 24.04 + Docker
curl -fsSL https://get.docker.com | sh

# 2. Code
git clone <backend-repo> /opt/cabdinasir/api && cd /opt/cabdinasir/api
cp .env.example .env && nano .env      # NODE_ENV=production, secrets cusub, CORS_ORIGIN, SMS_*

# 3. Kici (API + Postgres + Caddy HTTPS)
docker compose -f docker-compose.prod.yml up -d --build

# 4. Xogta aasaasiga (hal mar)
docker compose -f docker-compose.prod.yml exec api node dist/prisma/seed.js

# 5. Backup cron
echo "0 23 * * * cd /opt/cabdinasir/api && DATABASE_URL=... ./scripts/backup.sh >> /var/log/cabdinasir-backup.log 2>&1" | crontab -
```

DNS: `api.cabdinasirbus.com` iyo `app.cabdinasirbus.com` → IP-ga server-ka. Caddy wuxuu si automatic ah u helaa shahaadada HTTPS (Let's Encrypt).

**Cusboonaysiin (version cusub):** `git pull && docker compose -f docker-compose.prod.yml up -d --build` — migrations-ka si automatic ah ayay u socdaan marka API-gu kaco.

---

## 9. SMS

`SMS_PROVIDER=http` + `SMS_HTTP_URL` + `SMS_HTTP_TOKEN`. Fariimaha waxaa marka hore lagu kaydiyaa database-ka (outbox), worker ayaa 30 ilbiriqsi kasta diraya; haddii provider-ku dhaco → isku day 5 jeer (2, 4, 8, 16 daqiiqo). Super Admin wuxuu arkaa kuwa fashilmay (`GET /notifications?status=FAILED`) oo dib u diri karaa.
Provider-ka la doorto haddii uu qaab kale rabo, kaliya `src/notifications/sms.provider.ts` ayaa la beddelaa.

---

## 10. Qiyaasta Kharashka Bille ah (tusaale)

| Shay | Qiyaas |
|---|---|
| VPS (2 vCPU / 4 GB) | $10–25 |
| Domain | ~$1–2 (sannadkii ~$15) |
| Offsite backup (B2/S3) | $1–3 |
| SMS | sida provider-ka (fariin kasta) |
| 4G backup laan kasta | sida xirmada xogta |
