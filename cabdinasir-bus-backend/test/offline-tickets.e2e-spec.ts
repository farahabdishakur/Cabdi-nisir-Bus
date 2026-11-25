import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { api, createApp, login, PW, resetDb, seedBase } from './helpers';

/**
 * Tigidh offline (qoondada kuraasta): laamaha isku magaalada (BOR + BO2) kuraasta way kala qaybsadaan →
 * internet la'aan iib → sync: kursi la qaatay → mid kale (qoondada) · gaari baxay kadib iibka → waa la qoraa.
 */
describe('Offline tickets with seat quota (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let bor: ReturnType<typeof api>;
  let bo2: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let tripId: string;
  let borQuota: string[];
  let bo2Quota: string[];
  const pay = { method: 'CASH', currency: 'USD' };
  const item = (key: string, seatNo: string, at = new Date()) => ({
    idempotencyKey: key, offlineCreatedAt: at.toISOString(),
    booking: { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: pay },
  });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    const b2 = await prisma.branch.create({ data: { code: 'BO2', name: 'Boorama 2', city: 'Boorama' } });
    await prisma.user.create({ data: { phone: '0615', role: Role.CASHIER, branchId: b2.id, name: 'Karraani BO2', passwordHash: await argon2.hash(PW) } });
    app = await createApp();
    bor = api(app, await login(app, '0612'));
    bo2 = api(app, await login(app, '0615'));
    manager = api(app, await login(app, '0611'));
    tripId = (await manager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3 * 3600_000).toISOString() }).expect(201)).body.id;
    await bor.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
    await bo2.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('offline pack: each branch of the city gets its own seats (no overlap)', async () => {
    const a = (await bor.get('/sync/offline-pack').expect(200)).body.trips.find((t: { id: string }) => t.id === tripId);
    const b = (await bo2.get('/sync/offline-pack').expect(200)).body.trips.find((t: { id: string }) => t.id === tripId);
    borQuota = a.myQuota;
    bo2Quota = b.myQuota;
    expect(borQuota).toHaveLength(7);
    expect(bo2Quota).toHaveLength(7);
    expect(borQuota.filter((s) => bo2Quota.includes(s))).toEqual([]);
    expect(a).toMatchObject({ route: { ticketPriceCents: 300 }, vehicle: { plate: 'SL-1' }, taken: [] });
    expect(a.vehicle.seatLayout.rows.length).toBeGreaterThan(0);
  });

  it('sync: offline sale recorded with its real time; replay is idempotent', async () => {
    const at = new Date(Date.now() - 10 * 60_000);
    const r = await bor.post('/sync/bookings', { items: [item('off-key-0001', borQuota[0], at)] }).expect(201);
    expect(r.body.results[0]).toMatchObject({ ok: true, seatNo: borQuota[0], seatChangedFrom: null });
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: r.body.results[0].id } });
    expect(b.offlineCreatedAt?.toISOString()).toBe(at.toISOString());
    const again = await bor.post('/sync/bookings', { items: [item('off-key-0001', borQuota[0], at)] }).expect(201);
    expect(again.body.results[0].id).toBe(r.body.results[0].id);
  });

  it('conflict: seat sold online meanwhile → passenger moved to a free seat of the branch quota', async () => {
    const seat = borQuota[1];
    await bo2.post('/bookings', { tripId, seatNo: seat, passengerName: 'Online', passengerPhone: '0634222222', payment: pay }).expect(201);
    const r = await bor.post('/sync/bookings', { items: [item('off-key-0002', seat)] }).expect(201);
    expect(r.body.results[0]).toMatchObject({ ok: true, seatChangedFrom: seat });
    expect(borQuota).toContain(r.body.results[0].seatNo);
    expect(r.body.results[0].seatNo).not.toBe(seat);
  });

  it('bus departed after the offline sale → still recorded; sale after departure → refused', async () => {
    const before = new Date();
    await manager.patch(`/trips/${tripId}/status`, { status: 'DEPARTED' }).expect(200);
    const ok = await bor.post('/sync/bookings', { items: [item('off-key-0003', borQuota[4], before)] }).expect(201);
    expect(ok.body.results[0].ok).toBe(true);
    const late = await bor.post('/sync/bookings', { items: [item('off-key-0004', borQuota[5], new Date())] }).expect(201);
    expect(late.body.results[0]).toMatchObject({ ok: false, error: { code: 'TRIP_CLOSED_FOR_SALE' } });
    const clock = await bor.post('/sync/bookings', { items: [item('off-key-0005', borQuota[6], new Date(Date.now() - 5 * 86400_000))] }).expect(201);
    expect(clock.body.results[0].error.code).toBe('OFFLINE_TIME_INVALID');
  });
});
