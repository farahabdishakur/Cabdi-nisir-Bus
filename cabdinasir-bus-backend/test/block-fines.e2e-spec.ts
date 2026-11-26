import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Xannibaad (sabab waajib) · ganaax bas (+ darawalka laga jaro → ka laabasho) · lambarka baska ·
 * "bas soo galay" (karraani: hal bas) · warbixinta darawalka (baxay / gaadhay).
 */
describe('Block, fines, fleet numbers, driver report (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let busId: string;
  let drvId: string;

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    manager = api(app, await login(app, '0611'));
    cashier = api(app, await login(app, '0612'));
    const layout = { rows: [['D', null, null], ['1', '2', '3']], front: [] };
    drvId = (await prisma.driver.create({ data: { name: 'Xamse', phone: '0634999000' } })).id;
    busId = (await sa.post('/vehicles', { plate: 'sl-9', fleetNo: ' 13 ', model: 'Hiace', seatLayout: layout, defaultDriverId: drvId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('fleet number: normalised, unique, shown with the driver', async () => {
    const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: busId } });
    expect(v).toMatchObject({ plate: 'SL-9', fleetNo: '13' });
    const dup = await sa.patch(`/vehicles/${base.vehicle.id}`, { fleetNo: '13' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('FLEET_NO_USED');
    const list = await cashier.get('/vehicles').expect(200);
    expect(list.body.find((x: { id: string }) => x.id === busId).defaultDriver).toMatchObject({ name: 'Xamse', phone: '0634999000' });
  });

  it('arrival check-in: cashier adds ONE arrived bus to the queue (with fleet no + driver phone)', async () => {
    const r = await cashier.post(`/dispatch/${base.route.id}/enqueue`, { items: [{ vehicleId: busId, driverId: drvId }] }).expect(201);
    const e = r.body.entries.find((x: { vehicleId: string }) => x.vehicleId === busId);
    expect(e.vehicle.fleetNo).toBe('13');
    expect(e.driver.phone).toBe('0634999000');
  });

  it('block bus: reason required; blocked → removed from waiting queue; unblock clears the reason', async () => {
    // gaarigu wuu buuxsamayaa (LOADING → safar BOARDING) → lama xannibi karo ilaa la raro; bas kale ayaa la tijaabinayaa
    const layout = { rows: [['D', null], ['1', '2']], front: [] };
    const d2 = (await prisma.driver.create({ data: { name: 'Cali Yare', phone: '0634999111' } })).id;
    const b2 = (await sa.post('/vehicles', { plate: 'SL-10', fleetNo: '3G', model: 'Hiace', seatLayout: layout }).expect(201)).body.id;
    await manager.post(`/dispatch/${base.route.id}/enqueue`, { items: [{ vehicleId: b2, driverId: d2 }] }).expect(201);
    const noReason = await sa.patch(`/vehicles/${b2}`, { isActive: false });
    expect(noReason.body.error.code).toBe('BLOCK_REASON_REQUIRED');
    await sa.patch(`/vehicles/${b2}`, { isActive: false, blockReason: 'Ganaax booliis' }).expect(200);
    const v = await prisma.vehicle.findUniqueOrThrow({ where: { id: b2 } });
    expect(v).toMatchObject({ isActive: false, blockReason: 'Ganaax booliis' });
    expect(v.blockedAt).toBeTruthy();
    const entry = await prisma.dispatchEntry.findFirstOrThrow({ where: { vehicleId: b2 } });
    expect(entry).toMatchObject({ status: 'REMOVED', removedReason: 'BLOCKED: Ganaax booliis' });
    await sa.patch(`/vehicles/${b2}`, { isActive: true }).expect(200);
    expect(await prisma.vehicle.findUniqueOrThrow({ where: { id: b2 } })).toMatchObject({ isActive: true, blockReason: null, blockedAt: null });
  });

  it('block driver with upcoming trip → refused; block staff → login refused, reason stored', async () => {
    const r = await sa.patch(`/drivers/${drvId}`, { isActive: false, blockReason: 'Maqan' });
    expect(r.body.error.code).toBe('DRIVER_HAS_TRIPS');
    const free = await prisma.driver.create({ data: { name: 'Free', phone: '0634999222', branchId: base.bor.id } });
    await manager.patch(`/drivers/${free.id}`, { isActive: false, blockReason: 'Ganaax' }).expect(200);
    expect(await prisma.driver.findUniqueOrThrow({ where: { id: free.id } })).toMatchObject({ isActive: false, blockReason: 'Ganaax' });

    expect((await sa.patch(`/users/${base.users.wajCashier.id}`, { isActive: false })).body.error.code).toBe('BLOCK_REASON_REQUIRED');
    await sa.patch(`/users/${base.users.wajCashier.id}`, { isActive: false, blockReason: 'Lacag maqan' }).expect(200);
    const u = (await sa.get('/users').expect(200)).body.find((x: { id: string }) => x.id === base.users.wajCashier.id);
    expect(u).toMatchObject({ isActive: false, blockReason: 'Lacag maqan' });
    const lg = await import('supertest').then((m) => m.default(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: '0622', password: 'Passw0rd!' }));
    expect(lg.status).not.toBe(200);
  });

  it('bus fine charged to the driver → deduction; undo → deduction voided too; super admin only', async () => {
    expect((await manager.post('/vehicle-fines', { vehicleId: busId, amountCents: 2000, reason: 'Xawaare' })).status).toBe(403);
    const f = await sa.post('/vehicle-fines', { vehicleId: busId, amountCents: 2000, reason: 'Xawaare', chargeDriverId: drvId }).expect(201);
    expect(f.body).toMatchObject({ amountCents: 2000, vehicle: { fleetNo: '13' }, driver: { name: 'Xamse' } });
    const dp = await prisma.driverPayment.findUniqueOrThrow({ where: { id: f.body.driverPaymentId } });
    expect(dp).toMatchObject({ kind: 'DEDUCTION', amountCents: 2000, voidedAt: null });
    expect(dp.note).toContain('13');
    const list = await sa.get(`/vehicle-fines?vehicleId=${busId}`).expect(200);
    expect(list.body).toHaveLength(1);

    await sa.post(`/vehicle-fines/${f.body.id}/void`, { reason: 'Khalad' }).expect(201);
    expect((await prisma.driverPayment.findUniqueOrThrow({ where: { id: dp.id } })).voidedAt).toBeTruthy();
    expect((await sa.post(`/vehicle-fines/${f.body.id}/void`, { reason: 'Mar kale' })).body.error.code).toBe('ALREADY_VOIDED');

    const recordOnly = await sa.post('/vehicle-fines', { vehicleId: busId, amountCents: 500, reason: 'Dowladda' }).expect(201);
    expect(recordOnly.body.driverPaymentId).toBeNull();
    await expect(prisma.vehicleFine.delete({ where: { id: recordOnly.body.id } })).rejects.toThrow();
  });

  it('driver report: trips with bus number, actual departure and arrival time', async () => {
    const tripId = (await prisma.dispatchEntry.findFirstOrThrow({ where: { vehicleId: busId, status: 'LOADING' } })).tripId!;
    await manager.patch(`/trips/${tripId}/status`, { status: 'DEPARTED' }).expect(200);
    const waj = api(app, await login(app, '0621'));
    await waj.patch(`/trips/${tripId}/status`, { status: 'ARRIVED' }).expect(200);
    const r = await manager.get(`/reports/driver-trips?driverId=${drvId}`).expect(200);
    expect(r.body.drivers[0]).toMatchObject({ driver: 'Xamse', driverPhone: '0634999000', trips: 1, vehicles: ['13'] });
    expect(r.body.trips[0]).toMatchObject({ fleetNo: '13', vehicle: 'SL-9', status: 'ARRIVED' });
    expect(r.body.trips[0].departedAt).toBeTruthy();
    expect(r.body.trips[0].arrivedAt).toBeTruthy();
  });
});
