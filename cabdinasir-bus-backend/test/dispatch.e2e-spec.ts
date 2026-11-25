import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/** Bas 10 qof ah: 2 saf × (2 + waddo + 2) + safka dambe 2 */
const BUS10 = { rows: [['D', null, null, null, null], ['1', '2', null, '3', '4'], ['5', '6', null, '7', '8'], ['9', '10', null, null, null]], front: [] };

/**
 * Safka gaadiidka maalinta: bilow (kala horreyn) → gaariga koowaad buuxsamaa → kan xiga si toos ah ayuu u furmaa
 * → baxay → gaadhay magaalada kale → si toos ah safka soo laabashada ayuu galaa.
 */
describe('Dispatch queue (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let manager: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  const v: string[] = [];
  const d: string[] = [];
  let backRoute: string;

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    manager = api(app, await login(app, '0611'));
    cashier = api(app, await login(app, '0612'));
    wajManager = api(app, await login(app, '0621'));
    wajCashier = api(app, await login(app, '0622'));
    for (let i = 1; i <= 3; i++) {
      const drv = await prisma.driver.create({ data: { name: `Darawal ${i}`, phone: `06300${i}` } });
      const veh = await prisma.vehicle.create({ data: { plate: `BUS-${i}`, model: 'Bus', seatLayout: BUS10, capacity: 10, defaultDriverId: drv.id } });
      v.push(veh.id);
      d.push(drv.id);
    }
    backRoute = (await prisma.route.findFirstOrThrow({ where: { fromBranchId: base.waj.id } })).id;
    await cashier.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('candidates: active vehicles with their default driver; cashiers cannot manage', async () => {
    const c = await cashier.get('/dispatch/candidates').expect(200);
    expect(c.body.map((x: { plate: string }) => x.plate)).toEqual(expect.arrayContaining(['BUS-1', 'BUS-2', 'BUS-3', 'SL-1']));
    expect(c.body.find((x: { plate: string }) => x.plate === 'BUS-1').defaultDriver.name).toBe('Darawal 1');
    expect((await cashier.post(`/dispatch/${base.route.id}/enqueue`, { items: [{ vehicleId: v[0], driverId: d[0] }] })).status).toBe(403);
    expect((await wajManager.post(`/dispatch/${base.route.id}/enqueue`, { items: [{ vehicleId: v[0], driverId: d[0] }] })).status).toBe(403);
  });

  it('start of day: order kept, first vehicle opens for sale automatically', async () => {
    const r = await manager.post(`/dispatch/${base.route.id}/enqueue`, { items: [0, 1, 2].map((i) => ({ vehicleId: v[i], driverId: d[i] })) }).expect(201);
    const [first, second, third] = r.body.entries;
    expect([first.vehicle.plate, second.vehicle.plate, third.vehicle.plate]).toEqual(['BUS-1', 'BUS-2', 'BUS-3']);
    expect(first.status).toBe('LOADING');
    expect(first.trip).toMatchObject({ status: 'BOARDING', taken: 0, capacity: 10 });
    expect([second.status, third.status]).toEqual(['WAITING', 'WAITING']);
    // isla gaariga laba saf lama gelin karo
    expect((await manager.post(`/dispatch/${base.route.id}/enqueue`, { items: [{ vehicleId: v[1], driverId: d[1] }] })).body.error.code).toBe('ALREADY_QUEUED');
    // kala horreyn: BUS-3 kor u qaad
    const m = await manager.post(`/dispatch/entries/${third.id}/move`, { direction: 'up' }).expect(201);
    expect(m.body.entries.filter((e: { status: string }) => e.status === 'WAITING').map((e: { vehicle: { plate: string } }) => e.vehicle.plate)).toEqual(['BUS-3', 'BUS-2']);
    expect(r.body.stats).toMatchObject({ waiting: 2, loading: 1 });
  });

  it('when the loading bus is full, the next one opens for sale automatically', async () => {
    let board = (await cashier.get(`/dispatch/${base.route.id}`).expect(200)).body;
    const tripId = board.entries[0].tripId;
    for (let s = 1; s <= 10; s++) {
      await cashier.post('/bookings', { tripId, seatNo: String(s), passengerName: `Rakaab ${s}`, passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    }
    board = (await cashier.get(`/dispatch/${base.route.id}`).expect(200)).body;
    const loading = board.entries.filter((e: { status: string }) => e.status === 'LOADING');
    expect(loading.map((e: { vehicle: { plate: string } }) => e.vehicle.plate)).toEqual(['BUS-1', 'BUS-3']);
    expect(loading[0].trip.full).toBe(true);
    expect(loading[1].trip).toMatchObject({ taken: 0, full: false });
  });

  it('remove: absent driver leaves the queue; a loading bus with tickets cannot be removed', async () => {
    const board = (await manager.get(`/dispatch/${base.route.id}`).expect(200)).body;
    const bus1 = board.entries.find((e: { vehicle: { plate: string } }) => e.vehicle.plate === 'BUS-1');
    expect((await manager.post(`/dispatch/entries/${bus1.id}/remove`, { reason: 'darawal maqan' })).body.error.code).toBe('TRIP_HAS_BOOKINGS');
    const bus2 = board.entries.find((e: { vehicle: { plate: string } }) => e.vehicle.plate === 'BUS-2');
    const r = await manager.post(`/dispatch/entries/${bus2.id}/remove`, { reason: 'darawal maqan' }).expect(201);
    expect(r.body.entries.find((e: { id: string }) => e.id === bus2.id).status).toBe('REMOVED');
    // gaariga la saaray dib ayuu safka u geli karaa
    expect((await manager.get('/dispatch/candidates').expect(200)).body.map((x: { plate: string }) => x.plate)).toContain('BUS-2');
  });

  it('departed → DEPARTED in the queue; arrival puts the bus in the return queue automatically', async () => {
    const board = (await manager.get(`/dispatch/${base.route.id}`).expect(200)).body;
    const bus1 = board.entries.find((e: { vehicle: { plate: string } }) => e.vehicle.plate === 'BUS-1');
    await manager.patch(`/trips/${bus1.tripId}/status`, { status: 'DEPARTED' }).expect(200);
    const after = (await manager.get(`/dispatch/${base.route.id}`).expect(200)).body;
    expect(after.entries.find((e: { id: string }) => e.id === bus1.id).status).toBe('DEPARTED');
    expect(after.stats).toMatchObject({ departed: 1, passengers: 10, loading: 1 });

    await wajManager.patch(`/trips/${bus1.tripId}/status`, { status: 'ARRIVED' }).expect(200);
    const back = (await wajCashier.get(`/dispatch/${backRoute}`).expect(200)).body;
    const ret = back.entries.find((e: { vehicle: { plate: string } }) => e.vehicle.plate === 'BUS-1');
    expect(ret).toMatchObject({ status: 'LOADING', note: 'AUTO_RETURN' });
    expect(ret.trip.status).toBe('BOARDING');

    const ov = (await wajCashier.get('/dispatch').expect(200)).body;
    expect(ov.routes.length).toBe(2);
  });

  it('cancelling a loading trip removes it from the queue and opens the next', async () => {
    const board = (await manager.get(`/dispatch/${base.route.id}`).expect(200)).body;
    const bus3 = board.entries.find((e: { status: string }) => e.status === 'LOADING');
    await manager.patch(`/trips/${bus3.tripId}/status`, { status: 'CANCELLED', reason: 'gaari xumaaday' }).expect(200);
    const after = (await manager.get(`/dispatch/${base.route.id}`).expect(200)).body;
    expect(after.entries.find((e: { id: string }) => e.id === bus3.id).status).toBe('REMOVED');
  });
});
