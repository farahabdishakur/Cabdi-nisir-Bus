#!/usr/bin/env node
/**
 * Bandhig (demo): maalin shaqo oo dhab ah u eg — si dashboard-yada, buugaagta iyo warbixinadu xog u yeeshaan.
 * Wuxuu maraa API-ga dhabta ah (sharciyada oo dhan way shaqeeyaan). Backend-ku waa inuu socdaa (npm run dev:local).
 *
 *   Boorama 1: safka (3 bas) → 10 tigidh (bas 1 buuxsamay → bas 2 si toos ah ayuu u furmay) → 3 tigidh kale
 *   Boorama 2: 3 tigidh isla baska (laamaha magaalada way wadaagaan) + ballan taleefan
 *   Alaab: 3 xabbo → la raray · kharash shidaal · bas 1 wuu baxay → Wajaale wuu gaadhay → mushaharka darawalka (toos)
 *   Wajaale: alaabtii way timid → mid waa la dhiibay (PIN + COD) · bas 1 safka soo laabashada ayuu galay (toos)
 *
 * Isticmaal: `npm run demo:day`  (hal mar maalintii — mar labaad wuu ka boodayaa)
 */
const API = process.env.API ?? 'http://localhost:3000/api/v1';
const PW = 'Demo1234';
const say = (m) => console.log(`\x1b[36m[bandhig]\x1b[0m ${m}`);

async function call(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!r.ok) {
    const e = new Error(`${method} ${path} → ${r.status} ${data?.error?.code ?? ''} ${data?.error?.message ?? ''}`);
    e.code = data?.error?.code;
    throw e;
  }
  return data;
}
const login = async (phone) => (await call(null, 'POST', '/auth/login', { phone, password: PW })).accessToken;
const ok = (p, codes) => p.catch((e) => { if (!codes.includes(e.code)) throw e; return null; });

try {
  await fetch(`${API}/health`);
} catch {
  console.error('✗ Backend-ka ma socdo — marka hore kici (VS Code: ▶ Kici dhammaan, ama npm run dev:local)');
  process.exit(1);
}

const bo1Mgr = await login('0631000001');
const bo1 = await login('0631000002');
const bo2 = await login('0633000002');
const wajMgr = await login('0632000001');
const waj = await login('0632000002');

const boot = await call(bo1, 'GET', '/sync/bootstrap');
const br = Object.fromEntries(boot.branches.map((b) => [b.code, b]));
const route = (from, to) => boot.routes.find((r) => r.fromBranchId === br[from].id && r.toBranchId === br[to].id);
const r1 = route('BO1', 'WAJ');
if (!r1) throw new Error('Wadada BO1 → WAJ lama helin');

const board0 = await call(bo1Mgr, 'GET', `/dispatch/${r1.id}`);
if (board0.entries.some((e) => e.serviceDate === board0.date)) {
  say('Xogta bandhigga maanta horay ayaa loo geliyay ✓ (Maamul: 🧹 tirtir xogta → bilow cusub)');
  process.exit(0);
}

// 1. sanduuqyada
for (const t of [bo1, bo2, waj]) await ok(call(t, 'POST', '/cash-sessions/open', { openingUsdCents: 5000 }), ['SESSION_ALREADY_OPEN']);
say('Sanduuqyada Boorama 1, Boorama 2, Wajaale waa furan yihiin ($50 bilow)');

// 2. mushaharka darawallada: $5 safar kasta
const drivers = await call(bo1Mgr, 'GET', '/drivers');
for (const d of drivers.filter((x) => x.isActive)) await ok(call(bo1Mgr, 'PUT', `/driver-pay/${d.id}/rule`, { type: 'PER_TRIP', amountCents: 500 }), ['FORBIDDEN_BRANCH', 'FORBIDDEN']);
say('Mushaharka darawallada: $5 safar kasta');

// 3. safka gaadiidka (bas 10 qof)
const cands = (await call(bo1Mgr, 'GET', '/dispatch/candidates')).filter((c) => c.defaultDriver && c.plate.startsWith('BUS-'));
const items = cands.slice(0, 3).map((c) => ({ vehicleId: c.vehicleId, driverId: c.defaultDriver.id }));
if (items.length < 2) throw new Error('Gaadiid ku filan ma jiraan (BUS-1…4)');
await call(bo1Mgr, 'POST', `/dispatch/${r1.id}/enqueue`, { items });
say(`Safka Boorama 1 → Wajaale: ${cands.slice(0, 3).map((c) => c.plate).join(' → ')}`);

const loadingTrip = async () => {
  const b = await call(bo1, 'GET', `/dispatch/${r1.id}`);
  return b.entries.find((e) => e.status === 'LOADING' && e.trip && !e.trip.full);
};
const names = ['Axmed Cali', 'Hodan Faarax', 'Maxamed Yuusuf', 'Sahra Cabdi', 'Cumar Jaamac', 'Faadumo Xasan', 'Yuusuf Aadan', 'Khadra Muuse', 'Cabdiraxmaan', 'Ayaan Warsame', 'Ismaaciil Rooble', 'Naciimo Cali', 'Siciid Maxamuud'];
let paper1 = 1001;
let paper2 = 1001;
const sell = async (token, tripId, seatNo, i, paperPrefix, zaad = false) =>
  call(token, 'POST', '/bookings', {
    tripId, seatNo, passengerName: names[i % names.length], passengerPhone: `06341${String(10000 + i).slice(-5)}`,
    paperTicketNo: paperPrefix === 'BO1' ? `BO1-${paper1++}` : `BO2-${paper2++}`,
    payment: zaad ? { method: 'ZAAD', currency: 'USD', reference: `ZD${Date.now()}${i}`, payerPhone: '0634555666' } : { method: 'CASH', currency: 'USD' },
  });

// 4. bas 1: 10 tigidh (Boorama 1: 8, Boorama 2: 2) → wuu buuxsamay → bas 2 ayaa furmay
const bus1 = await loadingTrip();
for (let s = 1; s <= 10; s++) await sell(s <= 8 ? bo1 : bo2, bus1.tripId, String(s), s, s <= 8 ? 'BO1' : 'BO2', s % 4 === 0);
say(`${bus1.vehicle.plate}: 10/10 kursi (Cash + Zaad) → wuu buuxsamay`);
const bus2 = await loadingTrip();
for (let s = 1; s <= 4; s++) await sell(s <= 3 ? bo1 : bo2, bus2.tripId, String(s), 10 + s, s <= 3 ? 'BO1' : 'BO2');
await call(bo2, 'POST', '/bookings/reserve', { tripId: bus2.tripId, seatNo: '5', passengerName: 'Ballan Taleefan', passengerPhone: '0634777888' });
say(`${bus2.vehicle.plate}: si toos ah ayuu iib ugu furmay → 4 tigidh + 1 ballan taleefan (Boorama 2)`);

// 5. alaab Boorama 1 → Wajaale, la raray bas 1
const cat = boot.categories.find((c) => !c.isProhibited);
const parcels = [];
for (const [i, p] of [
  { sender: 'Xasan Diraha', receiver: 'Hodan Qaataha', kg: 12, payer: 'RECEIVER' },
  { sender: 'Cali Dukaan', receiver: 'Maryan Cabdi', kg: 25, payer: 'SENDER' },
  { sender: 'Sahra Shop', receiver: 'Cumar Jaamac', kg: 6, payer: 'SENDER' },
].entries()) {
  const x = await call(bo1, 'POST', '/parcels', {
    toBranchId: br.WAJ.id, categoryId: cat.id, weightKg: p.kg, pieces: 1, senderName: p.sender, senderPhone: `06342${String(10000 + i).slice(-5)}`,
    receiverName: p.receiver, receiverPhone: `06343${String(10000 + i).slice(-5)}`, payer: p.payer,
    ...(p.payer === 'SENDER' && { payment: { method: 'CASH', currency: 'USD' } }),
  });
  await call(bo1, 'POST', `/parcels/${x.id}/load`, { tripId: bus1.tripId });
  parcels.push(x);
}
say(`Alaab: ${parcels.map((p) => p.trackingCode).join(', ')} → ${bus1.vehicle.plate}`);

// 6. kharash
await call(bo1, 'POST', '/expenses', { category: 'FUEL', description: `Shidaal ${bus1.vehicle.plate}`, amount: 2000, currency: 'USD', tripId: bus1.tripId });
say('Kharash: shidaal $20 (sanduuqa Boorama 1)');

// 7. bas 1 wuu baxay → Wajaale wuu gaadhay
await call(bo1Mgr, 'PATCH', `/trips/${bus1.tripId}/status`, { status: 'DEPARTED' });
await call(wajMgr, 'PATCH', `/trips/${bus1.tripId}/status`, { status: 'ARRIVED' });
say(`${bus1.vehicle.plate}: wuu baxay → Wajaale wuu gaadhay (darawalka $5 si toos ah · safka soo laabashada si toos ah)`);

// 8. Wajaale: alaabtii way timid → mid waa la dhiibay (PIN + COD)
await call(waj, 'POST', '/parcels/arrive-batch', { tripId: bus1.tripId, parcelIds: parcels.map((p) => p.id) });
const cod = parcels[0];
await call(waj, 'POST', `/parcels/${cod.id}/deliver`, { pin: cod.pickupPin, receivedByName: 'Hodan Qaataha', payment: { method: 'CASH', currency: 'USD' } });
say(`Wajaale: 3 alaab way yimaadeen · ${cod.trackingCode} waa la dhiibay (PIN + COD)`);

say('✓ Diyaar! Fur website-ka: http://localhost:3001');
