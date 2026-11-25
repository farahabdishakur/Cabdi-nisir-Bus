/**
 * E2E (browser dhab ah): backend + website waa inay socdaan (README → "E2E").
 *   WEB=http://localhost:3001 node e2e/run.mjs
 * Socodka maalinta karraaniga: login → fur sanduuqa → iib tigidh (cash) → ballan taleefan → bixi ballanta (Zaad)
 * → alaab dir → manager: warbixino + barbar dhig Zaad. Sawirro: e2e/screenshots/.
 */
import { createRequire } from 'module';
import { mkdirSync } from 'fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const WEB = process.env.WEB ?? 'http://localhost:3001';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const CASHIER = { phone: '0631000002', password: 'Demo1234' };
const MANAGER = { phone: '0631000001', password: 'Demo1234' };

let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
const fail = (m) => {
  throw new Error(m);
};

async function apiLogin(who) {
  const r = await fetch(`${WEB}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(who) });
  if (!r.ok) fail(`login ${who.phone}: ${r.status}`);
  return (await r.json()).accessToken;
}

async function api(token, path, opts = {}) {
  const r = await fetch(`${WEB}/api/v1${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) } });
  const text = await r.text();
  if (!r.ok) fail(`${path}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

async function setup() {
  const m = await apiLogin(MANAGER);
  const routes = await api(m, '/routes');
  const me = await api(m, '/auth/me');
  const route = routes.find((r) => r.fromBranchId === me.branchId);
  const vehicles = await api(m, '/vehicles');
  const drivers = await api(m, '/drivers');
  // safar 3 saac kadib (ballan taleefan waa la oggol yahay ilaa 60 daqiiqo ka hor)
  const trip = await api(m, '/trips', {
    method: 'POST',
    body: JSON.stringify({ routeId: route.id, vehicleId: vehicles[0].id, driverId: drivers[0].id, departureAt: new Date(Date.now() + 3 * 3600_000).toISOString() }),
  }).catch(async (e) => {
    if (!String(e.message).includes('SCHEDULE_CLASH')) throw e;
    const list = await api(m, '/trips');
    return list.find((x) => x.status === 'SCHEDULED');
  });
  return { trip };
}

async function login(page, who) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel(/taleefanka|phone/i).fill(who.phone);
  await page.getByLabel(/password/i).fill(who.password);
  await page.getByRole('button', { name: /^gal$|sign in/i }).click();
  await page.waitForURL(`${WEB}/`);
}

async function main() {
  const { trip } = await setup();
  log(`setup: trip ${trip.id}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  // daabacaadda: window.print ha furin dialog
  await ctx.addInitScript(() => {
    window.print = () => undefined;
  });

  // 1. login
  await page.goto(`${WEB}/login`);
  await page.screenshot({ path: `${SHOTS}01-login.png` });
  await page.getByLabel(/taleefanka|phone/i).fill(CASHIER.phone);
  await page.getByLabel(/password/i).fill('wrong-pass1');
  await page.getByRole('button', { name: /^gal$/i }).click();
  await page.getByRole('alert').waitFor();
  log('wrong password shows an error');
  await login(page, CASHIER);
  await page.getByText('Tigidh iib').first().waitFor();
  await page.screenshot({ path: `${SHOTS}02-dashboard-cashier.png` });
  log('cashier dashboard');

  // 2. open drawer
  await page.goto(`${WEB}/cash`);
  const openBtn = page.getByRole('button', { name: /fur sanduuqa/i }).last();
  const expected = page.getByText(/lacagta la filayo/i).first();
  await Promise.race([openBtn.waitFor(), expected.waitFor()]);
  if (await openBtn.isVisible()) {
    await page.getByLabel(/bilowga \(USD\)/i).fill('10.00');
    await openBtn.click();
  }
  await page.getByText(/lacagta la filayo/i).first().waitFor();
  log('cash drawer open');

  // 3. sell a ticket (cash)
  await page.goto(`${WEB}/trips/${trip.id}`);
  await page.getByRole('button', { name: /Kursi 3:/ }).click();
  await page.getByText(/Kursiga waa kuu hayaa/).waitFor();
  await page.getByLabel('Taleefan').first().fill('0634111222');
  await page.getByLabel('Magac').first().fill('Axmed Cali');
  await page.screenshot({ path: `${SHOTS}03-sell-panel.png` });
  const [ticketTab] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /^Bixi \$/ }).click()]);
  await ticketTab.waitForLoadState();
  await ticketTab.getByText(/BO1-T-/).first().waitFor();
  await ticketTab.screenshot({ path: `${SHOTS}04-ticket-receipt.png`, fullPage: true });
  await ticketTab.close();
  await page.getByRole('button', { name: /Kursi 3: La iibiyay/ }).waitFor();
  log('ticket sold (cash) + receipt printed, seat 3 now sold');

  // 4. phone reservation
  await page.getByRole('button', { name: /Kursi 5:/ }).click();
  await page.getByRole('button', { name: /Ballan \(taleefan\)/ }).click();
  await page.getByLabel('Taleefan').first().fill('0634333444');
  await page.getByLabel('Magac').first().fill('Faadumo Xasan');
  await page.getByRole('button', { name: /^Ballan \(taleefan\)$/ }).last().click();
  await page.getByRole('button', { name: /Kursi 5: Ballan/ }).waitFor();
  await page.screenshot({ path: `${SHOTS}05-seatmap-reserved.png` });
  log('phone reservation: seat 5 shows as reserved');

  // 5. customer pays the reservation via Zaad
  await page.getByRole('button', { name: /Kursi 5: Ballan/ }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Zaad' }).click();
  await page.getByLabel(/transaction/i).fill('ZD-E2E-001');
  await page.getByLabel(/laga soo diray/i).fill('0634555666');
  await page.getByRole('button', { name: 'Hubi' }).click();
  await page.getByText(/lama isticmaalin/).waitFor();
  await page.screenshot({ path: `${SHOTS}06-pay-reservation-zaad.png` });
  const [t2] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('dialog').getByRole('button', { name: /^Bixi/ }).click()]);
  await t2.waitForLoadState();
  await t2.getByText('ZD-E2E-001').first().waitFor();
  await t2.close();
  await page.getByRole('button', { name: /Kursi 5: La iibiyay/ }).waitFor();
  log('reservation paid via Zaad → ticket with transaction on receipt');

  // 6. reuse of the same Zaad SMS is blocked
  await page.getByRole('button', { name: /Kursi 6:/ }).click();
  await page.getByLabel('Taleefan').first().fill('0634777888');
  await page.getByLabel('Magac').first().fill('Cumar');
  await page.getByRole('radio', { name: 'Zaad' }).click();
  await page.getByLabel(/transaction/i).fill('zd-e2e-001');
  await page.getByLabel(/laga soo diray/i).fill('0634555666');
  await page.getByRole('button', { name: /^Bixi \$/ }).click();
  await page.getByText(/horay ayaa loo isticmaalay/i).first().waitFor();
  await page.screenshot({ path: `${SHOTS}07-zaad-duplicate-blocked.png` });
  await page.getByRole('button', { name: 'Jooji' }).first().click();
  log('same Zaad transaction refused');

  // 7. send a parcel (COD)
  await page.goto(`${WEB}/parcels/new`);
  await page.getByLabel('Laanta loo dirayo').selectOption({ label: 'Wajaale' });
  const phones = page.getByLabel('Taleefan');
  const names = page.getByLabel('Magac');
  await phones.nth(0).fill('0634100100');
  await names.nth(0).fill('Xasan Diraha');
  await phones.nth(1).fill('0634200200');
  await names.nth(1).fill('Hodan Qaataha');
  await page.getByLabel('Nooca alaabta').selectOption({ label: 'Kabo' });
  await page.getByLabel(/Miisaanka/).fill('12');
  await page.getByText('$4.60').first().waitFor().catch(() => undefined);
  await page.getByRole('button', { name: /Qaataha \(marka la qaato/ }).click();
  await page.screenshot({ path: `${SHOTS}08-parcel-form.png`, fullPage: true });
  const [pTab] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: /^Diiwaangeli/ }).click()]);
  await pTab.waitForLoadState();
  await pTab.getByText(/CB-BO1-/).first().waitFor();
  await pTab.screenshot({ path: `${SHOTS}09-parcel-receipt.png`, fullPage: true });
  await pTab.close();
  const trackingCode = (await page.locator('p.font-mono').first().textContent())?.trim();
  const pin = await page.locator('.tracking-widest').first().textContent();
  if (!/^\d{4}$/.test(pin?.trim() ?? '')) fail(`PIN not shown: ${pin}`);
  await page.screenshot({ path: `${SHOTS}10-parcel-registered.png` });
  log(`parcel registered (COD) — PIN ${pin}`);
  const photo = { name: 'alaab.jpg', mimeType: 'image/jpeg', buffer: await page.screenshot({ type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 480, height: 360 } }) };
  await page.locator('label', { hasText: '📷 Sawir' }).locator('input[type=file]').setInputFiles(photo);
  await page.getByText('✓ 1 caddayn waa la kaydiyay').waitFor();
  log('evidence: parcel photographed at registration (compressed + stamped)');

  // 7b. load the parcel onto the vehicle
  await page.goto(`${WEB}/parcels/outgoing`);
  await page.getByLabel('Gaariga lagu rarayo').selectOption({ index: 1 });
  await page.getByRole('checkbox', { name: trackingCode }).check();
  await page.getByRole('button', { name: /Rar \(1\)/ }).click();
  await page.getByText(/Gaariga lagu raray \(1\)/).waitFor();
  log(`parcel ${trackingCode} loaded onto the vehicle`);

  // 8. bookings list: Zaad marker
  await page.goto(`${WEB}/bookings`);
  await page.getByRole('button', { name: 'La bixiyay' }).click();
  await page.getByText('Zaad ✓').first().waitFor();
  log('"Zaad ✓" marker in tickets list');

  // 8b. reprint is counted (anti-fraud)
  await page.getByRole('cell', { name: 'BO1-T-000001' }).click();
  const [rp] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('dialog').getByRole('button', { name: /Daabac/ }).click()]);
  await rp.getByText(/Nuqul #1/).waitFor();
  await rp.close();
  log('reprint counted on the receipt (#1)');

  // 8c. transfer: change seat 3 → 9
  await page.getByRole('dialog').getByRole('button', { name: /Beddel kursi/ }).click();
  await page.getByRole('combobox', { name: /^Kursi/ }).selectOption('9');
  await page.getByRole('button', { name: 'Xaqiiji' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  log('ticket moved from seat 3 to seat 9');

  // 8d. global search from the top bar
  await page.keyboard.press('/');
  await page.keyboard.type('0634200200');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/search\?q=/);
  await page.getByText(trackingCode).first().waitFor();
  log('global search finds the parcel by phone');

  // 8e. OFFLINE: register a parcel without internet, then it syncs automatically
  await page.goto(`${WEB}/parcels/new`);
  await page.getByLabel('Laanta loo dirayo').selectOption({ label: 'Wajaale' });
  await ctx.setOffline(true);
  await page.getByText(/Offline/).first().waitFor();
  const ph = page.getByLabel('Taleefan');
  const nm = page.getByLabel('Magac');
  await ph.nth(0).fill('0634300300');
  await nm.nth(0).fill('Diraha Offline');
  await ph.nth(1).fill('0634400400');
  await nm.nth(1).fill('Qaataha Offline');
  await page.getByLabel('Nooca alaabta').selectOption({ label: 'Dhar' });
  await page.getByLabel(/Miisaanka/).fill('5');
  await page.getByText(/Qiyaas offline/).waitFor();
  await page.getByRole('button', { name: /Qaataha \(marka la qaato/ }).click();
  await page.screenshot({ path: `${SHOTS}16-offline-form.png`, fullPage: true });
  await page.getByRole('button', { name: /^Diiwaangeli/ }).click();
  await page.getByText(/Waa la kaydiyay \(offline\)/).waitFor();
  await page.getByText(/^OFFLINE-/).first().waitFor();
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `${SHOTS}17-offline-receipt.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  log('offline: parcel saved locally + offline receipt with PIN');
  // reload while offline: the page comes from the service worker cache and the cashier stays signed in
  await page.goto(`${WEB}/parcels/new`).catch(() => undefined);
  await page.getByLabel('Laanta loo dirayo').waitFor();
  if (page.url().includes('/login')) fail('offline reload logged the cashier out');
  log('offline reload: page served from cache, still signed in');
  await ctx.setOffline(false);
  await page.goto(`${WEB}/offline`);
  await page.getByRole('button', { name: /Dir hadda/ }).click();
  await page.getByText(/CB-BO1-000002/).waitFor();
  await page.screenshot({ path: `${SHOTS}18-offline-synced.png` });
  log('back online: parcel synced → real code CB-BO1-000002');

  // 9. manager: reports + Zaad reconciliation
  await page.getByRole('button', { name: /ka bax/i }).click();
  await page.waitForURL(`${WEB}/login`);
  await login(page, MANAGER);
  await page.screenshot({ path: `${SHOTS}11-dashboard-manager.png` });
  await page.goto(`${WEB}/zaad`);
  await page.getByText('ZD-E2E-001').waitFor();
  await page.getByRole('checkbox', { name: 'ZD-E2E-001' }).check();
  await page.getByRole('button', { name: /la hubiyay/ }).click();
  await page.getByText('ZD-E2E-001').waitFor({ state: 'detached' });
  log('manager reconciled the Zaad payment');
  await page.goto(`${WEB}/system`);
  await page.getByText('TRANSFER').first().waitFor();
  log('manager: audit log shows the seat transfer');
  await page.goto(`${WEB}/reports`);
  await page.getByText(/Dakhli/).first().waitFor();
  await page.screenshot({ path: `${SHOTS}12-reports-daily.png` });
  log('reports: daily close');

  // 9-0. Safka gaadiidka: maamuluhu wuxuu bilaabaa maalinta → gaariga koowaad iib ayuu u furmaa
  await page.goto(`${WEB}/dispatch`);
  await page.getByText('Bilow maalinta').waitFor();
  await page.getByRole('button', { name: /^Bilow \(\d+ gaari\)/ }).click();
  await page.getByText('Hadda la buuxinayaa').waitFor();
  await page.screenshot({ path: `${SHOTS}22-dispatch.png`, fullPage: true });
  log('dispatch queue: day started — first bus loading, others waiting in order');
  await page.goto(`${WEB}/`);
  await page.getByText('Safka gaadiidka (hadda)').waitFor();
  log('dashboard shows the vehicle queue (loading bus + next)');

  // 9a. Xisaabaadka: automatic cashbook, driver pay, P&L
  await page.goto(`${WEB}/books`);
  await page.getByText('Lacag gashay').first().waitFor();
  await page.getByRole('cell', { name: /Tigidh/ }).first().waitFor();
  await page.screenshot({ path: `${SHOTS}15-cashbook.png` });
  log('cashbook filled automatically from tickets');
  await page.getByRole('button', { name: 'Mushaharka darawallada' }).click();
  await page.getByText('Lagu leeyahay').first().waitFor();
  await page.getByRole('row').nth(1).click();
  await page.getByText(/— Bayaanka/).waitFor();
  await page.getByRole('button', { name: /Qaabka mushaharka/ }).click();
  await page.getByLabel('$', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Kaydi' }).click();
  await page.getByText('$5.00 safar kasta').first().waitFor();
  await page.getByRole('button', { name: /\+ Abaalmarin/ }).click();
  await page.getByLabel(/Abaalmarin \(\$\)/).fill('2');
  await page.getByLabel(/Qoraal/).last().fill('E2E bonus');
  await page.getByRole('button', { name: 'Kaydi' }).click();
  await page.getByText('E2E bonus').waitFor();
  await page.getByRole('button', { name: 'Goyn', exact: true }).click();
  await page.getByLabel(/Goyn \(\$\)/).fill('0.50');
  await page.getByLabel(/Qoraal/).last().fill('E2E goyn');
  await page.getByRole('button', { name: 'Kaydi' }).click();
  await page.getByText('E2E goyn').waitFor();
  await page.screenshot({ path: `${SHOTS}16-driver-statement.png` });
  log('driver pay: rule set + bonus + deduction on statement');
  const [dv] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('row', { name: /E2E goyn/ }).getByRole('button', { name: '🖨' }).click()]);
  await dv.getByText('PAYMENT VOUCHER').waitFor();
  await dv.getByText('$1.50').first().waitFor();
  await dv.screenshot({ path: `${SHOTS}16b-driver-voucher.png`, fullPage: true });
  await dv.close();
  log('driver payment voucher: paid + total earned + still owed ($1.50)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: "Faa'iido & khasaare" }).click();
  await page.getByText("Faa'iidada baabuur kasta").waitFor();
  await page.screenshot({ path: `${SHOTS}17-profit-loss.png` });
  log('profit & loss page');

  // 9b. manager: vehicle departs
  await page.goto(`${WEB}/trips/${trip.id}`);
  await page.getByRole('button', { name: 'Gaarigu wuu baxay' }).click();
  await page.getByText('Baxay').first().waitFor();
  log('manager: vehicle departed');

  // 9c. Wajaale cashier: incoming → confirm arrival → hand over with PIN + COD
  await page.getByRole('button', { name: /ka bax/i }).click();
  await page.waitForURL(`${WEB}/login`);
  await login(page, { phone: '0632000002', password: 'Demo1234' });
  await page.goto(`${WEB}/cash`);
  const wOpen = page.getByRole('button', { name: /fur sanduuqa/i }).last();
  await Promise.race([wOpen.waitFor(), page.getByText(/lacagta la filayo/i).first().waitFor()]);
  if (await wOpen.isVisible()) await wOpen.click();
  await page.getByText(/lacagta la filayo/i).first().waitFor();
  await page.goto(`${WEB}/parcels/incoming`);
  await page.getByRole('checkbox', { name: trackingCode }).check();
  await page.screenshot({ path: `${SHOTS}14-incoming.png` });
  await page.getByRole('button', { name: /Xaqiiji kuwa la helay/ }).click();
  await page.getByText(new RegExp(`✓ 1 — ${trackingCode}`)).waitFor();
  log('Wajaale confirmed the parcel arrived');
  await page.goto(`${WEB}/parcels/deliver`);
  await page.getByPlaceholder(/Koodhka/).fill('0634200200');
  await page.getByRole('button', { name: 'Raadi' }).click();
  await page.getByText(trackingCode).first().click();
  await page.getByLabel('PIN-ka qaataha').fill(pin.trim() === '0000' ? '1111' : '0000');
  await page.getByRole('button', { name: /Wareeji \$4\.60/ }).click();
  await page.getByText(/PIN-ka waa khaldan/).waitFor();
  log('wrong PIN refused');
  await page.getByText('Sawirkii markii la diiwaangeliyay').waitFor();
  await page.locator('label', { hasText: '📷 Sawir' }).locator('input[type=file]').setInputFiles(photo);
  await page.getByText('Dhiibid').first().waitFor();
  log('handover: registration photo shown for comparison + handover photo taken');
  await page.getByLabel('PIN-ka qaataha').fill(pin.trim());
  await page.screenshot({ path: `${SHOTS}15-deliver.png` });
  await page.getByRole('button', { name: /Wareeji \$4\.60/ }).click();
  await page.getByText(/Alaabta waa la wareejiyay/).waitFor();
  log('handed over with PIN + COD $4.60 collected');

  // 9c-2. customer claims "it broke" → claim file shows the photo evidence
  await page.goto(`${WEB}/parcels/${trackingCode}`);
  await page.getByText('Caddaynta (sawir & video)').waitFor();
  await page.getByRole('button', { name: '+ Cabasho cusub' }).click();
  await page.getByLabel(/Waxa macmiilku sheegay/).fill('Kabaha mid ayaa jaban');
  await page.getByRole('button', { name: 'Diiwaangeli cabashada' }).click();
  await page.waitForURL(/\/claims\//);
  await page.getByText(/WAJ-C-000001/).first().waitFor();
  await page.getByText('Sawir markii la dhiibay').waitFor();
  await page.screenshot({ path: `${SHOTS}20-claim-file.png`, fullPage: true });
  log('claim opened → case file with registration + handover photos');

  // 9d. public pages (no login): tracking + schedule
  const pub = await browser.newContext();
  const pp0 = await pub.newPage();
  await pp0.goto(`${WEB}/track?code=${trackingCode}`);
  await pp0.getByLabel(/4-ta god/).fill('0200');
  await pp0.getByRole('button', { name: 'Raadi' }).click();
  await pp0.getByText(/La wareejiyay/).first().waitFor();
  await pp0.screenshot({ path: `${SHOTS}19-public-track.png`, fullPage: true });
  await pp0.goto(`${WEB}/schedule`);
  await pp0.getByText(/Jadwalka safarada/).first().waitFor();
  await pub.close();
  log('public: parcel tracking (no login) + schedule page');

  // 9e. Super Admin: temporary password → change; logo; vehicle seat editor; company-wide P&L
  const saCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const sp = await saCtx.newPage();
  sp.on('pageerror', (e) => consoleErrors.push(String(e)));
  await sp.goto(`${WEB}/login`);
  await sp.getByLabel(/taleefanka|phone/i).fill('0630000000');
  await sp.getByLabel(/password/i).fill(process.env.SA_PASSWORD ?? 'ChangeMe123!');
  await sp.getByRole('button', { name: /^gal$|sign in/i }).click();
  await sp.waitForURL(/change-password/);
  await sp.getByLabel(/Password-ka hadda/).fill(process.env.SA_PASSWORD ?? 'ChangeMe123!');
  await sp.getByLabel(/^Password cusub/).fill('E2eAdmin2026!');
  await sp.getByLabel(/Ku celi password/).fill('E2eAdmin2026!');
  await sp.getByRole('button', { name: 'Kaydi' }).click();
  await sp.waitForURL(`${WEB}/`);
  await sp.goto(`${WEB}/admin`);
  await sp.getByRole('button', { name: 'Dejinta', exact: true }).click();
  const logo = { name: 'logo.png', mimeType: 'image/png', buffer: await sp.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 120, height: 120 } }) };
  await sp.locator('label', { hasText: 'Soo geli logo' }).locator('input[type=file]').setInputFiles(logo);
  await sp.locator('aside img[alt="Cabdinasir Bus"]').waitFor();
  log('super admin: company logo uploaded → shown in the sidebar');
  await sp.getByRole('button', { name: 'Gaadiidka', exact: true }).click();
  await sp.getByRole('button', { name: '+ Ku dar' }).click();
  await sp.getByLabel(/Taarikada/).fill('SL-E2E-45');
  await sp.getByRole('button', { name: 'Bas weyn 45' }).click();
  await sp.getByText(/^45/).first().waitFor();
  await sp.screenshot({ path: `${SHOTS}21-seat-editor.png` });
  await sp.getByRole('button', { name: 'Kaydi' }).click();
  await sp.getByRole('cell', { name: 'SL-E2E-45' }).waitFor();
  log('super admin: vehicle with 45 seats designed visually (template) and saved');
  await sp.goto(`${WEB}/books`);
  await sp.getByText("Faa'iidada baabuur kasta").waitFor();
  await sp.getByRole('combobox').last().selectOption('');
  await sp.waitForTimeout(500);
  if ((await sp.getByRole('combobox').last().inputValue()) !== '') fail('P&L all-branches selection was reset');
  log('super admin: company-wide P&L (all branches) stays selected');
  await saCtx.close();

  // 10. phone layout
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const pp = await phone.newPage();
  await login(pp, CASHIER);
  await pp.goto(`${WEB}/trips/${trip.id}`);
  await pp.getByRole('button', { name: /Kursi 3:/ }).waitFor();
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await pp.screenshot({ path: `${SHOTS}13-mobile-seatmap.png`, fullPage: true });
  if (overflow) fail('horizontal scroll on phone');
  log('phone layout: no horizontal scroll');

  await browser.close();
  const real = consoleErrors.filter((e) => !/Failed to load resource|401|409|400|Failed to fetch RSC payload|ERR_INTERNET_DISCONNECTED/.test(e));
  if (real.length) fail(`console errors:\n${real.join('\n')}`);
  console.log(`\nALL ${step} STEPS PASSED`);
}

main().catch((e) => {
  console.error('✗ FAILED:', e.message);
  process.exit(1);
});
