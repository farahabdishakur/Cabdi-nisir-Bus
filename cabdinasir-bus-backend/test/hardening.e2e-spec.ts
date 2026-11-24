import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Xaaladaha dhabta ah ee maalinlaha: qalad la saxo, PIN lumay, gaari xumaaday, karraani tagay,
 * badhan laba jeer la riixay, live updates, faa'iidada safarka.
 */
describe('Hardening (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let borCashier: ReturnType<typeof api>;
  let borManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let borCashierToken: string;
  let wajCashierToken: string;
  let tripA: string;
  let tripB: string;
  let port: number;

  const newTrip = async (hoursAhead: number, vehicleId = base.vehicle.id, driverId = base.driver.id) =>
    (await borManager.post('/trips', { routeId: base.route.id, vehicleId, driverId, departureAt: new Date(Date.now() + hoursAhead * 3600_000).toISOString() }).expect(201)).body.id as string;
  const sell = (tripId: string, seatNo: string) =>
    borCashier.post('/bookings', { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
  const parcel = (over: object = {}) =>
    borCashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 2, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' }, ...over,
    }).expect(201);

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    sa = api(app, await login(app, '0600'));
    borCashierToken = await login(app, '0612');
    wajCashierToken = await login(app, '0622');
    borCashier = api(app, borCashierToken);
    wajCashier = api(app, wajCashierToken);
    borManager = api(app, await login(app, '0611'));
    await sa.put('/exchange-rates/today', { usdToSlsh: 8500 }).expect(200);
    const v2 = await prisma.vehicle.create({ data: { plate: 'SL-2', model: 'Hiace', seatLayout: (await prisma.vehicle.findFirstOrThrow()).seatLayout as object, capacity: 14 } });
    const d2 = await prisma.driver.create({ data: { name: 'Muuse', phone: '0633999' } });
    tripA = await newTrip(2);
    tripB = await newTrip(2.5, v2.id, d2.id);
    await borCashier.post('/cash-sessions/open', { openingUsdCents: 5000 }).expect(201);
    await borManager.post('/cash-sessions/open', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('double-click on expense / deposit with same Idempotency-Key records money once', async () => {
    const body = { category: 'FUEL', description: 'Shidaal', amount: 700, currency: 'USD', tripId: tripA };
    const [a, b] = await Promise.all([
      borCashier.post('/expenses', body).set('Idempotency-Key', 'exp-key-0001'),
      borCashier.post('/expenses', body).set('Idempotency-Key', 'exp-key-0001'),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.expense.count({ where: { idempotencyKey: 'exp-key-0001' } })).toBe(1);
    expect(await prisma.payment.count({ where: { kind: 'EXPENSE' } })).toBe(1);

    const d1 = await borCashier.post('/deposits', { target: 'BANK', amount: 100, currency: 'USD' }).set('Idempotency-Key', 'dep-key-0001').expect(201);
    const d2 = await borCashier.post('/deposits', { target: 'BANK', amount: 100, currency: 'USD' }).set('Idempotency-Key', 'dep-key-0001').expect(201);
    expect(d2.body.id).toBe(d1.body.id);
    expect(await prisma.payment.count({ where: { kind: 'DEPOSIT' } })).toBe(1);
  });

  it('parcel correction: origin cashier fixes a typo (audited); destination cashier cannot', async () => {
    const p = await parcel();
    const ok = await borCashier.patch(`/parcels/${p.body.id}`, { receiverPhone: '063 4777777', reason: 'Lambar qaldan' }).expect(200);
    expect(ok.body.receiverPhone).toBe('0634777777');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'parcels', entityId: p.body.id, action: 'CORRECT' } });
    expect(audit.before).toEqual({ receiverPhone: '0634666666' });
    expect((await wajCashier.patch(`/parcels/${p.body.id}`, { receiverName: 'Xamse', reason: 'test' })).body.error.code).toBe('FORBIDDEN_BRANCH');
    expect((await borCashier.patch(`/parcels/${p.body.id}`, { reason: 'nothing' })).body.error.code).toBe('NOTHING_TO_CHANGE');
    // price fields are not accepted
    expect((await borCashier.patch(`/parcels/${p.body.id}`, { weightKg: 1, reason: 'x x' })).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lost PIN: reset gives a new PIN by SMS; old PIN stops working', async () => {
    const p = await parcel();
    const oldPin = p.body.pickupPin;
    await prisma.parcel.update({ where: { id: p.body.id }, data: { status: 'ARRIVED', arrivedAt: new Date() } });
    const r = await wajCashier.post(`/parcels/${p.body.id}/reset-pin`, { note: 'Qaatihii PIN-ka wuu lumiyay, ID waa la hubiyay' }).expect(201);
    expect(r.body.pickupPin).toMatch(/^\d{4}$/);
    expect(await prisma.notification.count({ where: { parcelId: p.body.id, template: 'PARCEL_PIN_RESET' } })).toBe(1);
    if (r.body.pickupPin !== oldPin) {
      const bad = await wajCashier.post(`/parcels/${p.body.id}/deliver`, { pin: oldPin, receivedByName: 'Qaataha' });
      expect(bad.body.error.code).toBe('INVALID_PIN');
    }
    await wajCashier.post('/cash-sessions/open', {}).expect(201);
    await wajCashier.post(`/parcels/${p.body.id}/deliver`, { pin: r.body.pickupPin, receivedByName: 'Qaataha' }).expect(201);
  });

  it('booking correction before departure, audited', async () => {
    const b = await sell(tripA, '10');
    const r = await borCashier.patch(`/bookings/${b.body.id}`, { passengerName: 'Magaca Saxda', reason: 'Higgaad qalad' }).expect(200);
    expect(r.body.passengerName).toBe('Magaca Saxda');
    expect(await prisma.auditLog.count({ where: { entity: 'bookings', entityId: b.body.id, action: 'CORRECT' } })).toBe(1);
  });

  it('breakdown: move all passengers + loaded parcels to another trip, keeping seats when free', async () => {
    await sell(tripA, '1');
    await sell(tripA, '2');
    await sell(tripB, '1'); // seat 1 already taken on B
    const p = await parcel();
    await borCashier.post(`/parcels/${p.body.id}/load`, { tripId: tripA }).expect(201);

    expect((await borCashier.post(`/trips/${tripA}/move-bookings`, { targetTripId: tripB, reason: 'x' })).status).toBe(403);
    const r = await borManager.post(`/trips/${tripA}/move-bookings`, { targetTripId: tripB, reason: 'Gaarigii wuu xumaaday' }).expect(201);
    expect(r.body.moved).toHaveLength(3); // seats 10, 1, 2
    const byFrom = Object.fromEntries(r.body.moved.map((m: { from: string; to: string }) => [m.from, m.to]));
    expect(byFrom['2']).toBe('2');
    expect(byFrom['10']).toBe('10');
    expect(byFrom['1']).not.toBe('1');
    expect(r.body.parcelsMoved).toBe(1);
    expect(await prisma.booking.count({ where: { tripId: tripA, status: { not: 'VOIDED' } } })).toBe(0);
    expect((await prisma.parcel.findUniqueOrThrow({ where: { id: p.body.id } })).tripId).toBe(tripB);
    // source can now be cancelled
    await borManager.patch(`/trips/${tripA}/status`, { status: 'CANCELLED', reason: 'Gaari xumaaday' }).expect(200);
  });

  it('force close: manager closes a session the cashier left open', async () => {
    const wajManager = api(app, await login(app, '0621'));
    const s = await prisma.cashSession.findFirstOrThrow({ where: { cashierId: base.users.borCashier.id, closedAt: null } });
    expect((await borCashier.post(`/cash-sessions/${s.id}/force-close`, { countedUsdCents: 0, countedSlsh: 0, note: 'x' })).status).toBe(403);
    expect((await wajManager.post(`/cash-sessions/${s.id}/force-close`, { countedUsdCents: 0, countedSlsh: 0, note: 'x' })).body.error.code).toBe('FORBIDDEN_BRANCH');
    expect((await borManager.post(`/cash-sessions/${s.id}/force-close`, { countedUsdCents: 0, countedSlsh: 0 })).body.error.code).toBe('REASON_REQUIRED');
    const r = await borManager.post(`/cash-sessions/${s.id}/force-close`, { countedUsdCents: 5000, countedSlsh: 0, note: 'Karraanigu wuu tagay' }).expect(201);
    expect(r.body.forceClosedById).toBe(base.users.borManager.id);
    expect(r.body.closedAt).toBeTruthy();
    await borCashier.post('/cash-sessions/open', {}).expect(201);
  });

  it('trips profit: tickets + parcels − trip expenses', async () => {
    const r = await borManager.get('/reports/trips-profit').expect(200);
    const a = r.body.trips.find((t: { tripId: string }) => t.tripId === tripA);
    expect(a).toBeUndefined(); // cancelled trip excluded
    const b = r.body.trips.find((t: { tripId: string }) => t.tripId === tripB);
    expect(b.passengers).toBe(4);
    expect(b.ticketsUsdCents).toBeGreaterThan(0);
    expect(b.parcelsUsdCents).toBeGreaterThan(0);
    // expense was booked against trip A (cancelled) → not counted on B
    expect(b.profitUsdCents).toBe(b.ticketsUsdCents + b.parcelsUsdCents - b.expensesUsdCents);
    const csv = await borManager.get('/reports/trips-profit?format=csv').expect(200);
    expect(csv.text).toContain('profitUsdCents');
  });

  it('exchange rate history', async () => {
    const r = await borCashier.get('/exchange-rates').expect(200);
    expect(r.body[0].usdToSlsh).toBe(8500);
  });

  it('offline sync rejects impossible timestamps (wrong PC clock)', async () => {
    const r = await borCashier.post('/sync/parcels', {
      items: [{
        idempotencyKey: 'offline-time-1', offlineCreatedAt: new Date(Date.now() + 86400_000).toISOString(),
        parcel: { toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 1, pieces: 1, senderName: 'Aa', senderPhone: '0634555555', receiverName: 'Bb', receiverPhone: '0634666666', payer: 'RECEIVER' },
      }],
    }).expect(201);
    expect(r.body.results[0].error.code).toBe('OFFLINE_TIME_INVALID');
  });

  it('public schedule shows open departures with free seats only', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/public/trips?from=BOR&to=WAJ').expect(200);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
    expect(r.body[0]).toEqual(expect.objectContaining({ from: 'Boorama', to: 'Wajaale', priceCents: 300 }));
    expect(JSON.stringify(r.body)).not.toContain('Rakaab');
  });

  it('login attempts are audited (success and failure)', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '0612', password: 'wrong-pass' }).expect(401);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', userId: base.users.borCashier.id } })).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN', userId: base.users.borCashier.id } })).toBeGreaterThanOrEqual(1);
    const pw = await prisma.auditLog.findFirstOrThrow({ where: { action: 'LOGIN_FAILED' } });
    expect(JSON.stringify(pw.after)).not.toContain('wrong-pass');
  });

  it('live events: branch staff get seat/parcel updates for their branches only', async () => {
    const listen = (token: string) => {
      const chunks: string[] = [];
      const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/events', headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (c: string) => chunks.push(c));
      });
      return { chunks, close: () => req.destroy() };
    };
    const bor = listen(borCashierToken);
    const waj = listen(wajCashierToken);
    await new Promise((r) => setTimeout(r, 300));

    await borCashier.post(`/trips/${tripB}/seats/12/hold`).expect(201); // Boorama only
    await sell(tripB, '13'); // Boorama → Wajaale route: both
    await parcel(); // to Wajaale: both
    await new Promise((r) => setTimeout(r, 300));
    bor.close();
    waj.close();

    const borText = bor.chunks.join('');
    const wajText = waj.chunks.join('');
    expect(borText).toContain('event: SEAT_CHANGED');
    expect(borText).toContain('"held":true');
    expect(borText).toContain('event: PARCEL_CHANGED');
    expect(wajText).toContain('event: PARCEL_CHANGED');
    expect(wajText).toContain('"seatNo":"13"');
    expect(wajText).not.toContain('"held":true');
    expect(borText + wajText).not.toContain('0634'); // no phone numbers in events
  });
});
