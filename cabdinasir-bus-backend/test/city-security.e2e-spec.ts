import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { api, createApp, login, PW, resetDb } from './helpers';
import { HIACE_14 } from '../src/vehicles/seat-layout';
import { JobsService } from '../src/jobs/jobs.service';

/**
 * Boorama waxay leedahay 2 laamood (BO1, BO2) + Wajaale (WAJ).
 * Labada laamood ee Boorama waxay wadaagaan safarada; lacagta mid kasta waa gooni.
 * + Amniga: token-ka isla markiiba dhaca, password ku-meel-gaar ah, password adag, integrity.
 */
describe('Boorama 2 branches + security (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const ids: Record<string, string> = {};
  let bo1Mgr: ReturnType<typeof api>;
  let bo1Cash: ReturnType<typeof api>;
  let bo2Cash: ReturnType<typeof api>;
  let bo2Mgr: ReturnType<typeof api>;
  let wajCash: ReturnType<typeof api>;
  let wajMgr: ReturnType<typeof api>;
  let sa: ReturnType<typeof api>;
  let tripBW: string; // BO1 → WAJ
  let tripWB: string; // WAJ → BO1

  beforeAll(async () => {
    await resetDb(prisma);
    await prisma.pricingSetting.create({ data: { key: 'ticketMode', value: 0 } });
    const hash = await argon2.hash(PW);
    const bo1 = await prisma.branch.create({ data: { code: 'BO1', name: 'Boorama — Laanta 1', city: 'Boorama' } });
    const bo2 = await prisma.branch.create({ data: { code: 'BO2', name: 'Boorama — Laanta 2', city: 'Boorama' } });
    const waj = await prisma.branch.create({ data: { code: 'WAJ', name: 'Wajaale', city: 'Wajaale' } });
    Object.assign(ids, { bo1: bo1.id, bo2: bo2.id, waj: waj.id });
    const mk = (phone: string, role: Role, branchId: string | null, extra: object = {}) =>
      prisma.user.create({ data: { phone, role, branchId, name: phone, passwordHash: hash, ...extra } });
    await mk('0600', Role.SUPER_ADMIN, null, { phone: '0634000000' });
    await mk('0611', Role.BRANCH_MANAGER, bo1.id);
    await mk('0612', Role.CASHIER, bo1.id);
    await mk('0621', Role.BRANCH_MANAGER, bo2.id);
    await mk('0622', Role.CASHIER, bo2.id);
    await mk('0631', Role.BRANCH_MANAGER, waj.id);
    await mk('0632', Role.CASHIER, waj.id);
    const r1 = await prisma.route.create({ data: { fromBranchId: bo1.id, toBranchId: waj.id, ticketPriceCents: 300, parcelPerKgCents: 30 } });
    const r2 = await prisma.route.create({ data: { fromBranchId: waj.id, toBranchId: bo1.id, ticketPriceCents: 300, parcelPerKgCents: 30 } });
    await prisma.route.create({ data: { fromBranchId: bo2.id, toBranchId: waj.id, ticketPriceCents: 300, parcelPerKgCents: 30 } });
    await prisma.route.create({ data: { fromBranchId: waj.id, toBranchId: bo2.id, ticketPriceCents: 300, parcelPerKgCents: 30 } });
    const v1 = await prisma.vehicle.create({ data: { plate: 'SL-1', model: 'Hiace', seatLayout: HIACE_14 as object, capacity: 14 } });
    const v2 = await prisma.vehicle.create({ data: { plate: 'SL-2', model: 'Hiace', seatLayout: HIACE_14 as object, capacity: 14 } });
    const d1 = await prisma.driver.create({ data: { name: 'Cali', phone: '0633' } });
    const d2 = await prisma.driver.create({ data: { name: 'Muuse', phone: '0634' } });
    ids.shoes = (await prisma.parcelCategory.create({ data: { nameSo: 'Kabo', nameEn: 'Shoes', baseFeeCents: 100 } })).id;
    Object.assign(ids, { r1: r1.id, r2: r2.id, v1: v1.id, v2: v2.id, d1: d1.id, d2: d2.id });

    app = await createApp();
    sa = api(app, await login(app, '0634000000'));
    bo1Mgr = api(app, await login(app, '0611'));
    bo1Cash = api(app, await login(app, '0612'));
    bo2Mgr = api(app, await login(app, '0621'));
    bo2Cash = api(app, await login(app, '0622'));
    wajMgr = api(app, await login(app, '0631'));
    wajCash = api(app, await login(app, '0632'));
    tripBW = (await bo1Mgr.post('/trips', { routeId: r1.id, vehicleId: v1.id, driverId: d1.id, departureAt: new Date(Date.now() + 3600_000).toISOString() }).expect(201)).body.id;
    tripWB = (await wajMgr.post('/trips', { routeId: r2.id, vehicleId: v2.id, driverId: d2.id, departureAt: new Date(Date.now() + 1800_000).toISOString() }).expect(201)).body.id;
    for (const c of [bo1Cash, bo2Cash, wajCash, bo2Mgr]) await c.post('/cash-sessions/open', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ Boorama 2 laamood

  it('routes and parcels between the two Boorama branches are rejected (same city)', async () => {
    const r = await sa.post('/routes', { fromBranchId: ids.bo1, toBranchId: ids.bo2, ticketPriceCents: 100, parcelPerKgCents: 10 });
    expect(r.body.error.code).toBe('SAME_CITY');
    const q = await bo1Cash.post('/parcels/quote', { toBranchId: ids.bo2, categoryId: ids.shoes, weightKg: 1 });
    expect(q.body.error.code).toBe('SAME_CITY');
  });

  it('Boorama-2 sees and sells seats on the Boorama-1 departure; money and receipt belong to Boorama-2', async () => {
    const list = await bo2Cash.get('/trips').expect(200);
    expect(list.body.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([tripBW, tripWB]));
    const b = await bo2Cash
      .post('/bookings', { tripId: tripBW, seatNo: '5', passengerName: 'Rakaab BO2', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } })
      .expect(201);
    expect(b.body.receiptNo).toMatch(/^BO2-T-/);
    expect(b.body.branchId).toBe(ids.bo2);
    expect(b.body.payments[0].branchId).toBe(ids.bo2);
    // Boorama-1 sees the seat as sold (shared seat map) and cannot double-sell it
    const map = await bo1Cash.get(`/trips/${tripBW}/seats`).expect(200);
    expect(map.body.seats.find((s: { seatNo: string }) => s.seatNo === '5').state).toBe('BOOKED');
    const dup = await bo1Cash.post('/bookings', { tripId: tripBW, seatNo: '5', passengerName: 'Kale', passengerPhone: '0634222222', payment: { method: 'CASH', currency: 'USD' } });
    expect(dup.body.error.code).toBe('SEAT_TAKEN');
    // Wajaale cannot sell a Boorama departure
    const w = await wajCash.post('/bookings', { tripId: tripBW, seatNo: '6', passengerName: 'Waj', passengerPhone: '0634333333', payment: { method: 'CASH', currency: 'USD' } });
    expect(w.status).toBe(403);
    // revenue: ticket counted for BO2, not BO1
    const rev = await sa.get('/reports/revenue').expect(200);
    const by = (code: string) => rev.body.perBranch.find((x: { branch: { code: string } }) => x.branch.code === code);
    expect(by('BO2').totalUsdCents).toBe(300);
    expect(by('BO1').totalUsdCents).toBe(0);
  });

  it('void of a Boorama-2 ticket is decided by Boorama-2 manager, not Boorama-1', async () => {
    const b = await bo2Cash.post('/bookings', { tripId: tripBW, seatNo: '7', passengerName: 'Void Me', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect((await bo1Mgr.post(`/bookings/${b.body.id}/void`, { reason: 'test test' })).body.error.code).toBe('FORBIDDEN_BRANCH');
    await bo2Mgr.post(`/bookings/${b.body.id}/void`, { reason: 'Rakaabku wuu ka noqday' }).expect(201);
  });

  it('the van picks up parcels from both Boorama branches; Wajaale receives them', async () => {
    const mk = (c: ReturnType<typeof api>) =>
      c.post('/parcels', {
        toBranchId: ids.waj, categoryId: ids.shoes, weightKg: 2, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
        receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' },
      }).expect(201);
    const p1 = await mk(bo1Cash);
    const p2 = await mk(bo2Cash);
    expect(p2.body.trackingCode).toMatch(/^CB-BO2-/);
    await bo1Cash.post(`/parcels/${p1.body.id}/load`, { tripId: tripBW }).expect(201);
    await bo2Cash.post(`/parcels/${p2.body.id}/load`, { tripId: tripBW }).expect(201);
    // Boorama-1 cannot touch Boorama-2's parcel
    expect((await bo1Cash.post(`/parcels/${p2.body.id}/unload`)).body.error.code).toBe('FORBIDDEN_BRANCH');
    await bo1Mgr.patch(`/trips/${tripBW}/status`, { status: 'DEPARTED' }).expect(200);
    const r = await wajCash.post('/parcels/arrive-batch', { tripId: tripBW, parcelIds: [p1.body.id, p2.body.id] }).expect(201);
    expect(r.body.arrived).toHaveLength(2);
  });

  it('Wajaale → Boorama-1 trip can carry parcels for Boorama-2; Boorama-2 manager confirms arrival', async () => {
    const p = await wajCash.post('/parcels', {
      toBranchId: ids.bo2, categoryId: ids.shoes, weightKg: 1, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha BO2', receiverPhone: '0634666666', payer: 'RECEIVER',
    }).expect(201);
    await wajCash.post(`/parcels/${p.body.id}/load`, { tripId: tripWB }).expect(201);
    await wajMgr.patch(`/trips/${tripWB}/status`, { status: 'DEPARTED' }).expect(200);
    // only Boorama-2 (the parcel's destination) can mark it arrived
    expect((await bo1Cash.post(`/parcels/${p.body.id}/arrive`)).body.error.code).toBe('FORBIDDEN_BRANCH');
    await bo2Cash.post(`/parcels/${p.body.id}/arrive`).expect(201);
    // trip arrival in Boorama: either Boorama manager may confirm
    await bo2Mgr.patch(`/trips/${tripWB}/status`, { status: 'ARRIVED' }).expect(200);
  });

  it('setting shareTripsWithinCity=0 makes every branch independent again', async () => {
    await sa.put('/pricing-settings', { shareTripsWithinCity: 0 }).expect(200);
    const t = await bo1Mgr.post('/trips', { routeId: ids.r1, vehicleId: ids.v2, driverId: ids.d2, departureAt: new Date(Date.now() + 10 * 3600_000).toISOString() }).expect(201);
    expect((await bo2Cash.get(`/trips/${t.body.id}`)).body.error.code).toBe('FORBIDDEN_BRANCH');
    await sa.put('/pricing-settings', { shareTripsWithinCity: 1 }).expect(200);
    await bo2Cash.get(`/trips/${t.body.id}`).expect(200);
  });

  // ------------------------------------------------------------------ Amniga

  it('deactivating a user kills their access token immediately (not after 15 min)', async () => {
    const token = await login(app, '0632');
    await api(app, token).get('/auth/me').expect(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { phone: '0632' } });
    await wajMgr.patch(`/users/${u.id}`, { isActive: false }).expect(200);
    const r = await api(app, token).get('/auth/me');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('SESSION_REVOKED');
    await wajMgr.patch(`/users/${u.id}`, { isActive: true }).expect(200);
  });

  it('role change applies at once (role read from DB, not from the old token)', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { phone: '0622' } });
    const token = await login(app, '0622');
    await api(app, token).get('/trips').expect(200);
    await sa.patch(`/users/${u.id}`, { role: 'DRIVER' }).expect(200);
    expect((await api(app, token).get('/trips')).status).toBe(401); // token revoked
    await sa.patch(`/users/${u.id}`, { role: 'CASHIER' }).expect(200);
  });

  it('temporary password: new users must change it before doing anything else', async () => {
    const weak = await bo1Mgr.post('/users', { name: 'Karraani Cusub', phone: '0619999', password: 'password', role: 'CASHIER', branchId: ids.bo1 });
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    await bo1Mgr.post('/users', { name: 'Karraani Cusub', phone: '0619999', password: 'Temp1234', role: 'CASHIER', branchId: ids.bo1 }).expect(201);
    const l = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '0619999', password: 'Temp1234' }).expect(200);
    expect(l.body.user.mustChangePassword).toBe(true);
    const u = api(app, l.body.accessToken);
    const blocked = await u.get('/trips');
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await u.get('/auth/me').expect(200);
    expect((await u.post('/auth/change-password', { currentPassword: 'Temp1234', newPassword: 'Temp1234' })).body.error.code).toBe('SAME_PASSWORD');
    const ch = await u.post('/auth/change-password', { currentPassword: 'Temp1234', newPassword: 'Cusub5678' }).expect(200);
    expect((await u.get('/auth/me')).status).toBe(401); // old token revoked
    await api(app, ch.body.accessToken).get('/trips').expect(200); // new token works
  });

  it('large offline sync payload (>100kb) is accepted', async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      idempotencyKey: `big-sync-${String(i).padStart(4, '0')}`,
      offlineCreatedAt: new Date().toISOString(),
      parcel: {
        toBranchId: ids.waj, categoryId: ids.shoes, weightKg: 1, pieces: 1, senderName: 'Diraha ' + 'x'.repeat(60),
        senderPhone: '0634555555', receiverName: 'Qaataha ' + 'y'.repeat(60), receiverPhone: '0634666666', payer: 'RECEIVER',
        description: 'z'.repeat(300),
      },
    }));
    expect(JSON.stringify({ items }).length).toBeGreaterThan(100_000);
    const r = await bo1Cash.post('/sync/parcels', { items }).expect(201);
    expect(r.body.synced).toBe(200);
  }, 60_000);

  it('health details and integrity report (super admin); integrity alert SMS', async () => {
    const h = await sa.get('/health/details').expect(200);
    expect(h.body.db.latencyMs).toBeGreaterThanOrEqual(0);
    expect((await bo1Mgr.get('/health/details')).status).toBe(403);

    // a booking without payment = integrity problem
    const b = await prisma.booking.findFirstOrThrow({ where: { status: 'CONFIRMED' } });
    await prisma.payment.updateMany({ where: { bookingId: b.id }, data: { bookingId: null } });
    const r = await sa.get('/reports/integrity').expect(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.checks.ticketsWithoutPayment.map((x: { id: string }) => x.id)).toContain(b.id);
    const alert = await app.get(JobsService).runIntegrityAlert();
    expect(alert.notified).toBe(1);
    expect(await prisma.notification.count({ where: { template: 'INTEGRITY_ALERT', to: '+252634000000' } })).toBe(1);
  });
  it('PIN brute force: locked after 5 wrong tries; reset-pin unlocks', async () => {
    const p = await bo1Cash.post('/parcels', {
      toBranchId: ids.waj, categoryId: ids.shoes, weightKg: 1, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' },
    }).expect(201);
    await prisma.parcel.update({ where: { id: p.body.id }, data: { status: 'ARRIVED', arrivedAt: new Date() } });
    const wrong = p.body.pickupPin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) {
      const r = await wajMgr.post(`/parcels/${p.body.id}/deliver`, { pin: wrong, receivedByName: 'Tuug' });
      expect(r.body.error.code).toBe('INVALID_PIN');
    }
    const locked = await wajMgr.post(`/parcels/${p.body.id}/deliver`, { pin: p.body.pickupPin, receivedByName: 'Qaataha' });
    expect(locked.body.error.code).toBe('PIN_LOCKED');
    expect(await prisma.auditLog.count({ where: { entityId: p.body.id, action: 'PIN_FAILED' } })).toBe(5);
    const reset = await wajMgr.post(`/parcels/${p.body.id}/reset-pin`, { note: 'ID la hubiyay' }).expect(201);
    await wajMgr.post('/cash-sessions/open', {}).expect(201);
    await wajMgr.post(`/parcels/${p.body.id}/deliver`, { pin: reset.body.pickupPin, receivedByName: 'Qaataha' }).expect(201);
  });
});
