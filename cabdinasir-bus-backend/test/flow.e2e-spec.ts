import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Socodka buuxa ee maalin shaqo: Boorama → Wajaale.
 * Tigidh + alaab (COD) → rar → bixitaan → gaadhay → wareejin → xiritaanka sanduuqa → warbixino.
 */
describe('Cabdinasir Bus — full day flow (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let borCashier: ReturnType<typeof api>;
  let borManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let sa: ReturnType<typeof api>;
  let tripId: string;

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    borCashier = api(app, await login(app, '0612'));
    borManager = api(app, await login(app, '0611'));
    wajCashier = api(app, await login(app, '0622'));
    wajManager = api(app, await login(app, '0621'));
    sa = api(app, await login(app, '0600'));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects requests without token and wrong roles', async () => {
    const s = app.getHttpServer();
    const request = (await import('supertest')).default;
    await request(s).get('/api/v1/trips').expect(401);
    const r = await borCashier.post('/routes', { fromBranchId: base.bor.id, toBranchId: base.waj.id, ticketPriceCents: 1, parcelPerKgCents: 1 });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  it('super admin sets exchange rate; managers create trips', async () => {
    await sa.put('/exchange-rates/today', { usdToSlsh: 8500 }).expect(200);
    const res = await borManager
      .post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3600_000).toISOString() })
      .expect(201);
    tripId = res.body.id;
    // Wajaale manager cannot create a trip departing Boorama
    const bad = await wajManager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date().toISOString() });
    expect(bad.status).toBe(403);
    // same vehicle within 3h → clash
    const clash = await borManager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 2 * 3600_000).toISOString() });
    expect(clash.body.error.code).toBe('SCHEDULE_CLASH');
  });

  it('cannot sell without an open cash session', async () => {
    const r = await borCashier.post('/bookings', { tripId, seatNo: '3', passengerName: 'Axmed', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } });
    expect(r.body.error.code).toBe('NO_OPEN_SESSION');
    await borCashier.post('/cash-sessions/open', { openingUsdCents: 1000, openingSlsh: 0 }).expect(201);
    await wajCashier.post('/cash-sessions/open', {}).expect(201);
  });

  it('seat hold blocks other sellers; booking computes price server-side', async () => {
    await borCashier.post(`/trips/${tripId}/seats/1/hold`).expect(201);
    const other = await borManager.post(`/trips/${tripId}/seats/1/hold`);
    expect(other.body.error.code).toBe('SEAT_HELD');

    const b = await borCashier
      .post('/bookings', { tripId, seatNo: '1', passengerName: 'Axmed', passengerPhone: '0634 111111', payment: { method: 'CASH', currency: 'USD' } })
      .set('Idempotency-Key', 'booking-key-0001')
      .expect(201);
    expect(b.body.priceCents).toBe(350); // 300 + front seat 50
    expect(b.body.receiptNo).toBe('BOR-T-000001');

    // same Idempotency-Key → same booking, no double payment
    const again = await borCashier
      .post('/bookings', { tripId, seatNo: '1', passengerName: 'Axmed', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } })
      .set('Idempotency-Key', 'booking-key-0001');
    expect(again.body.id).toBe(b.body.id);
    expect(await prisma.payment.count({ where: { bookingId: b.body.id } })).toBe(1);

    const dup = await borManager.post('/cash-sessions/open', {}).then(() =>
      borManager.post('/bookings', { tripId, seatNo: '1', passengerName: 'Xamse', passengerPhone: '0634222222', payment: { method: 'CASH', currency: 'USD' } }),
    );
    expect(dup.body.error.code).toBe('SEAT_TAKEN');
  });

  it('cashier cannot discount; manager limited to max; SLSH payment converted', async () => {
    const c = await borCashier.post('/bookings', { tripId, seatNo: '3', passengerName: 'Faadumo', passengerPhone: '0634333333', discountCents: 10, payment: { method: 'CASH', currency: 'USD' } });
    expect(c.status).toBe(403);
    const m = await borManager.post('/bookings', { tripId, seatNo: '3', passengerName: 'Faadumo', passengerPhone: '0634333333', discountCents: 200, payment: { method: 'CASH', currency: 'USD' } });
    expect(m.body.error.code).toBe('DISCOUNT_TOO_HIGH');
    const s = await borCashier.post('/bookings', { tripId, seatNo: '3', passengerName: 'Faadumo', passengerPhone: '0634333333', payment: { method: 'CASH', currency: 'SLSH' } }).expect(201);
    expect(s.body.payments[0]).toMatchObject({ currency: 'SLSH', amount: 25500, amountUsdCents: 300 });
    const z = await borCashier.post('/bookings', { tripId, seatNo: '4', passengerName: 'Cumar', passengerPhone: '0634444444', payment: { method: 'ZAAD', currency: 'USD' } });
    expect(z.body.error.code).toBe('VALIDATION_ERROR'); // reference required
  });

  let parcelId: string;
  let pin: string;

  it('parcel: prohibited rejected; quote = create price; COD registered', async () => {
    const banned = await borCashier.post('/parcels/quote', { toBranchId: base.waj.id, categoryId: base.banned.id, weightKg: 5 });
    expect(banned.body.error.code).toBe('PARCEL_PROHIBITED');

    const q = await borCashier.post('/parcels/quote', { toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 12 }).expect(201);
    expect(q.body.totalCents).toBe(460);

    const p = await borCashier
      .post('/parcels', {
        toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 12, pieces: 2,
        senderName: 'Xasan', senderPhone: '0634555555', receiverName: 'Hodan', receiverPhone: '0634666666', payer: 'RECEIVER',
      })
      .expect(201);
    expect(p.body).toMatchObject({ trackingCode: 'CB-BOR-000001', receiptNo: 'BOR-P-000001', feeCents: 460, status: 'REGISTERED', paidAt: null });
    expect(p.body.pickupPin).toMatch(/^\d{4}$/);
    expect(p.body.pickupPinHash).toBeUndefined();
    parcelId = p.body.id;
    pin = p.body.pickupPin;

    const sender = await borCashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 1, pieces: 1,
      senderName: 'Xasan', senderPhone: '0634555555', receiverName: 'Hodan', receiverPhone: '0634666666', payer: 'SENDER',
    });
    expect(sender.body.error.code).toBe('PAYMENT_REQUIRED');
  });

  it('Wajaale sees the parcel as incoming only after loading; cannot load it themselves', async () => {
    const out = await borCashier.get('/parcels/outgoing').expect(200);
    expect(out.body.map((x: { id: string }) => x.id)).toContain(parcelId);
    const wrongSide = await wajCashier.post(`/parcels/${parcelId}/load`, { tripId });
    expect(wrongSide.body.error.code).toBe('FORBIDDEN_BRANCH');

    await borCashier.post(`/parcels/${parcelId}/load`, { tripId }).expect(201);
    const inc = await wajCashier.get('/parcels/incoming').expect(200);
    expect(inc.body[0]).toMatchObject({ id: parcelId, status: 'LOADED' });

    const manifest = await borCashier.get(`/trips/${tripId}/manifest`).expect(200);
    expect(manifest.body.totals).toMatchObject({ passengers: 2, parcels: 1, pieces: 2, codToCollectCents: 460 });
  });

  it('departure locks the trip and moves parcels in transit; arrival at Wajaale', async () => {
    const early = await wajCashier.post(`/parcels/${parcelId}/arrive`);
    expect(early.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    await borManager.patch(`/trips/${tripId}/status`, { status: 'DEPARTED' }).expect(200);
    const late = await borCashier.post('/bookings', { tripId, seatNo: '5', passengerName: 'Late', passengerPhone: '0634777777', payment: { method: 'CASH', currency: 'USD' } });
    expect(late.body.error.code).toBe('TRIP_CLOSED_FOR_SALE');

    const res = await wajCashier.post('/parcels/arrive-batch', { tripId, parcelIds: [parcelId] }).expect(201);
    expect(res.body).toEqual({ arrived: ['CB-BOR-000001'], missing: [] });
    await wajManager.patch(`/trips/${tripId}/status`, { status: 'ARRIVED' }).expect(200);
  });

  it('delivery needs correct PIN and COD payment', async () => {
    const wrong = await wajCashier.post(`/parcels/${parcelId}/deliver`, { pin: pin === '0000' ? '1111' : '0000', receivedByName: 'Hodan' });
    expect(wrong.body.error.code).toBe('INVALID_PIN');
    const noPay = await wajCashier.post(`/parcels/${parcelId}/deliver`, { pin, receivedByName: 'Hodan' });
    expect(noPay.body.error.code).toBe('PAYMENT_REQUIRED');
    expect(noPay.body.error.details.codDueCents).toBe(460);
    const ok = await wajCashier.post(`/parcels/${parcelId}/deliver`, { pin, receivedByName: 'Hodan', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect(ok.body).toMatchObject({ status: 'DELIVERED', deliveredToName: 'Hodan' });

    const detail = await borCashier.get('/parcels/CB-BOR-000001').expect(200);
    expect(detail.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['REGISTERED', 'LOADED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED']);
  });

  it('cash close computes variance; cashier cannot approve own; manager approves', async () => {
    const cur = await borCashier.get('/cash-sessions/current').expect(200);
    // opening 10.00 + ticket 3.50 cash USD → expected USD 1350; SLSH 25500
    expect(cur.body.summary.expectedCash).toEqual({ USD: 1350, SLSH: 25500 });
    const closed = await borCashier.post(`/cash-sessions/${cur.body.id}/close`, { countedUsdCents: 1300, countedSlsh: 25500 }).expect(201);
    expect(closed.body.variance).toEqual({ USD: -50, SLSH: 0 });
    expect((await borCashier.post(`/cash-sessions/${cur.body.id}/approve`, {})).status).toBe(403);
    expect((await wajManager.post(`/cash-sessions/${cur.body.id}/approve`, {})).body.error.code).toBe('FORBIDDEN_BRANCH');
    await borManager.post(`/cash-sessions/${cur.body.id}/approve`, { note: 'shortage explained' }).expect(201);
  });

  it('reports: revenue per branch, exceptions, inter-branch COD; branch scoping', async () => {
    const rev = await sa.get('/reports/revenue').expect(200);
    const bor = rev.body.perBranch.find((b: { branch: { code: string } }) => b.branch.code === 'BOR');
    const waj = rev.body.perBranch.find((b: { branch: { code: string } }) => b.branch.code === 'WAJ');
    expect(bor.totalUsdCents).toBe(650);
    expect(waj.byKind.PARCEL).toBe(460);

    const exc = await borManager.get('/reports/exceptions').expect(200);
    expect(exc.body.cashVariances).toHaveLength(1);

    const ib = await sa.get('/reports/inter-branch').expect(200);
    expect(ib.body.codCollected[0]).toMatchObject({ originBranchId: base.bor.id, collectedByBranchId: base.waj.id, usdCents: 460 });

    const forbidden = await wajManager.get(`/reports/revenue?branchId=${base.bor.id}`);
    expect(forbidden.body.error.code).toBe('FORBIDDEN_BRANCH');
  });

  it('void requires manager + reason, refunds, and audit is written; DB blocks deletes', async () => {
    const trip2 = await borManager
      .post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 8 * 3600_000).toISOString() })
      .expect(201);
    await borCashier.post('/cash-sessions/open', {}).expect(201);
    const b = await borCashier.post('/bookings', { tripId: trip2.body.id, seatNo: '6', passengerName: 'Muna', passengerPhone: '0634888888', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect((await borCashier.post(`/bookings/${b.body.id}/void`, { reason: 'changed mind' })).status).toBe(403);
    await borManager.post(`/bookings/${b.body.id}/void`, { reason: 'changed mind', refund: true }).expect(201);
    const pays = await prisma.payment.findMany({ where: { bookingId: b.body.id }, orderBy: { createdAt: 'asc' } });
    expect(pays.map((p) => p.amountUsdCents)).toEqual([300, -300]);
    expect(await prisma.auditLog.count({ where: { entity: 'bookings', entityId: b.body.id, action: 'VOID' } })).toBe(1);
    // seat is free again
    await borCashier.post('/bookings', { tripId: trip2.body.id, seatNo: '6', passengerName: 'Other', passengerPhone: '0634999999', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    await expect(prisma.payment.deleteMany({})).rejects.toThrow(/VOID/);
  });

  it('managers manage only cashiers/drivers of their own branch', async () => {
    const ok = await borManager.post('/users', { name: 'New Cashier', phone: '0612999', password: 'Passw0rd!', role: 'CASHIER', branchId: base.bor.id });
    expect(ok.status).toBe(201);
    expect(ok.body.passwordHash).toBeUndefined();
    const promote = await borManager.post('/users', { name: 'Xamse', phone: '0612998', password: 'Passw0rd!', role: 'BRANCH_MANAGER', branchId: base.bor.id });
    expect(promote.status).toBe(403);
    const other = await borManager.post('/users', { name: 'Xamse', phone: '0612997', password: 'Passw0rd!', role: 'CASHIER', branchId: base.waj.id });
    expect(other.body.error.code).toBe('FORBIDDEN_BRANCH');
  });
  it('race: two sellers hit the same seat at the same moment → exactly one wins', async () => {
    const t = await borManager
      .post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 20 * 3600_000).toISOString() })
      .expect(201);
    const body = (n: string) => ({ tripId: t.body.id, seatNo: '9', passengerName: n, passengerPhone: '0634121212', payment: { method: 'CASH', currency: 'USD' } });
    const results = await Promise.all([
      borCashier.post('/bookings', body('Racer A')),
      borManager.post('/bookings', body('Racer B')),
      borCashier.post('/bookings', body('Racer C')),
      borManager.post('/bookings', body('Racer D')),
    ]);
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 201)) expect(['SEAT_TAKEN', 'SEAT_HELD']).toContain(r.body.error.code);
    expect(await prisma.booking.count({ where: { tripId: t.body.id, status: { not: 'VOIDED' } } })).toBe(1);
    expect(await prisma.payment.count({ where: { booking: { tripId: t.body.id } } })).toBe(1);
  });
});
