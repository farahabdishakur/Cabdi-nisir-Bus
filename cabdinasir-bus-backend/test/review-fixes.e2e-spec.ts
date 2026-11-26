import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Regression tests for the independent security review: races that could pay twice / lose money,
 * cross-branch access, brute force, token reuse.
 */
describe('Security review fixes (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let borCashier: ReturnType<typeof api>;
  let borManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let tripId: string;
  let port: number;

  const sell = (who: ReturnType<typeof api>, seatNo: string) =>
    who.post('/bookings', { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    sa = api(app, await login(app, '0600'));
    borCashier = api(app, await login(app, '0612'));
    borManager = api(app, await login(app, '0611'));
    wajCashier = api(app, await login(app, '0622'));
    wajManager = api(app, await login(app, '0621'));
    await sa.put('/exchange-rates/today', { usdToSlsh: 8500 }).expect(200);
    tripId = (await borManager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3600_000).toISOString() }).expect(201)).body.id;
    await borCashier.post('/cash-sessions/open', { openingUsdCents: 1000 }).expect(201);
    await borManager.post('/cash-sessions/open', { openingUsdCents: 5000 }).expect(201);
    await wajCashier.post('/cash-sessions/open', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('#1 double void with refund at the same moment → voided once, refunded once', async () => {
    const b = await sell(borCashier, '3').expect(201);
    const req = await borCashier.post('/void-requests', { entity: 'BOOKING', entityId: b.body.id, reason: 'Rakaab baxay', refund: true }).expect(201);
    const results = await Promise.all([
      borManager.post(`/bookings/${b.body.id}/void`, { reason: 'Direct void', refund: true }),
      borManager.post(`/bookings/${b.body.id}/void`, { reason: 'Direct void', refund: true }),
      borManager.post(`/void-requests/${req.body.id}/approve`, {}),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { bookingId: b.body.id, kind: 'REFUND' } })).toBe(1);
  });

  it('#2 sales racing the drawer close never leave money outside "expected"', async () => {
    const s = await borCashier.get('/cash-sessions/current').expect(200);
    const sales = ['5', '6', '7', '8', '9', '10'].map((n) => sell(borCashier, n));
    const close = borCashier.post(`/cash-sessions/${s.body.id}/close`, { countedUsdCents: 0, countedSlsh: 0 });
    await Promise.all([...sales, close]);
    const closed = await prisma.cashSession.findUniqueOrThrow({ where: { id: s.body.id } });
    const cash = await prisma.payment.aggregate({ where: { cashSessionId: s.body.id, method: 'CASH', currency: 'USD' }, _sum: { amount: true } });
    const opening = (closed.openingFloat as { USD: number }).USD;
    expect((closed.expected as { USD: number }).USD).toBe(opening + (cash._sum.amount ?? 0));
    await borCashier.post('/cash-sessions/open', { openingUsdCents: 1000 }).expect(201);
  });

  it('#3 parallel expenses cannot overdraw the drawer; parallel expense voids reverse once', async () => {
    const cur = await borCashier.get('/cash-sessions/current').expect(200);
    const available = cur.body.summary.expectedCash.USD as number; // 1000
    const res = await Promise.all(
      Array.from({ length: 4 }, () => borCashier.post('/expenses', { category: 'FUEL', description: 'Shidaal', amount: 400, currency: 'USD' })),
    );
    expect(res.filter((r) => r.status === 201).length).toBe(Math.floor(available / 400));
    const after = await borCashier.get('/cash-sessions/current').expect(200);
    expect(after.body.summary.expectedCash.USD).toBeGreaterThanOrEqual(0);

    const e = res.find((r) => r.status === 201)!;
    const voids = await Promise.all([1, 2, 3].map(() => borManager.post(`/expenses/${e.body.id}/void`, { reason: 'qalad baa dhacay' })));
    expect(voids.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.payment.count({ where: { kind: 'EXPENSE', amount: 400 } })).toBe(1);
  });

  it('#4 transfer: cashier cannot give a refund by moving to a cheaper seat; other branch cannot transfer', async () => {
    const b = await borCashier.post('/bookings', { tripId, seatNo: '1', passengerName: 'Front', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect(b.body.priceCents).toBe(350);
    const down = await borCashier.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '11' });
    expect(down.status).toBe(403);
    const other = await wajCashier.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '11' });
    expect(other.status).toBe(403);
    const ok = await borManager.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '11' }).expect(201);
    const refund = ok.body.payments.find((p: { kind: string }) => p.kind === 'TRANSFER_DIFF');
    expect(refund).toMatchObject({ amountUsdCents: -50, method: 'CASH', branchId: base.bor.id });
  });

  it('#5 managers cannot take over drivers of other branches or link non-driver accounts', async () => {
    const d = await borManager.post('/drivers', { name: 'Darawal BOR', phone: '0634777777' }).expect(201);
    expect(d.body.branchId).toBe(base.bor.id);
    expect((await wajManager.patch(`/drivers/${d.body.id}`, { isActive: false })).body.error.code).toBe('FORBIDDEN_BRANCH');
    expect((await wajManager.patch(`/drivers/${base.driver.id}`, { isActive: false })).body.error.code).toBe('FORBIDDEN_BRANCH');
    const cashier = await prisma.user.findUniqueOrThrow({ where: { phone: '0612' } });
    expect((await borManager.patch(`/drivers/${d.body.id}`, { userId: cashier.id })).body.error.code).toBe('NOT_A_DRIVER_ACCOUNT');
  });

  it('#6 parallel wrong PINs cannot exceed 5 tries', async () => {
    const p = await borCashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 1, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' },
    }).expect(201);
    await prisma.parcel.update({ where: { id: p.body.id }, data: { status: 'ARRIVED', arrivedAt: new Date() } });
    const wrong = p.body.pickupPin === '0000' ? '1111' : '0000';
    const res = await Promise.all(Array.from({ length: 12 }, () => wajCashier.post(`/parcels/${p.body.id}/deliver`, { pin: wrong, receivedByName: 'Tuug' })));
    expect(res.filter((r) => r.body.error?.code === 'INVALID_PIN').length).toBeLessThanOrEqual(5);
    expect((await prisma.parcel.findUniqueOrThrow({ where: { id: p.body.id } })).pinFailures).toBe(5);
  });

  it('#7 wrong passwords lock the attacker (phone+IP), not the account', async () => {
    const s = app.getHttpServer();
    for (let i = 0; i < 5; i++) await request(s).post('/api/v1/auth/login').send({ phone: '0611', password: 'wrong-pass1' }).expect(401);
    const blocked = await request(s).post('/api/v1/auth/login').send({ phone: '0611', password: 'wrong-pass1' });
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    const u = await prisma.user.findUniqueOrThrow({ where: { phone: '0611' } });
    expect(u.lockedUntil).toBeNull();
  });

  it('#8 the same refresh token used twice at once → only one succeeds', async () => {
    const l = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '0622', password: 'Test1234!' }).expect(200);
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken }),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('#9 cashiers cannot read the branch dashboard', async () => {
    expect((await borCashier.get('/reports/dashboard')).status).toBe(403);
    await borManager.get('/reports/dashboard').expect(200);
  });

  it('#10a Idempotency-Key of another user is not replayed (no data leak)', async () => {
    await borCashier.post('/bookings', { tripId, seatNo: '12', passengerName: 'Key', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } })
      .set('Idempotency-Key', 'shared-key-0001').expect(201);
    const r = await borManager.post('/bookings', { tripId, seatNo: '13', passengerName: 'Key', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } })
      .set('Idempotency-Key', 'shared-key-0001');
    expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('#10b absurd amounts are rejected (no 500); two tabs cannot open two drawers', async () => {
    const r = await borCashier.post('/expenses', { category: 'FUEL', description: 'x x x', amount: 99_999_999_999, currency: 'USD' });
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    const wajMgrOpen = await Promise.all([wajManager.post('/cash-sessions/open', {}), wajManager.post('/cash-sessions/open', {})]);
    expect(wajMgrOpen.map((x) => x.status).sort()).toEqual([201, 409]);
  });

  it('#10c PIN SMS cannot be "retried" with a redacted PIN', async () => {
    const n = await prisma.notification.findFirstOrThrow({ where: { template: 'PARCEL_REGISTERED' } });
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED' } });
    expect((await borManager.post(`/notifications/${n.id}/retry`)).body.error.code).toBe('PIN_SMS_EXPIRED');
  });

  it('#10d live events stream is cut when the user is deactivated', async () => {
    const token = await login(app, '0612');
    let ended = false;
    const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/events', headers: { Authorization: `Bearer ${token}` } }, (res) => {
      res.on('data', () => undefined);
      res.on('end', () => (ended = true));
    });
    await new Promise((r) => setTimeout(r, 300));
    const u = await prisma.user.findUniqueOrThrow({ where: { phone: '0612' } });
    await borManager.patch(`/users/${u.id}`, { isActive: false, blockReason: 'Test block' }).expect(200);
    await new Promise((r) => setTimeout(r, 6500));
    req.destroy();
    expect(ended).toBe(true);
    await borManager.patch(`/users/${u.id}`, { isActive: true }).expect(200);
  }, 15_000);
});
