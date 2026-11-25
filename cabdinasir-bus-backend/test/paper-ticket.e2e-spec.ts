import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/** Tigidhka warqadda (gacanta lagu qoro): lambarka buugga waa waajib (ticketMode 1), hal mar laan kasta. */
describe('Paper tickets (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let tripId: string;
  const pay = { method: 'CASH', currency: 'USD' };
  const sell = (seatNo: string, paperTicketNo?: string, who = cashier) =>
    who.post('/bookings', { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: pay, ...(paperTicketNo !== undefined && { paperTicketNo }) });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
    manager = api(app, await login(app, '0611'));
    wajCashier = api(app, await login(app, '0622'));
    await sa.put('/pricing-settings', { ticketMode: 1 }).expect(200);
    tripId = (await manager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3 * 3600_000).toISOString() }).expect(201)).body.id;
    await cashier.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('paper number is required and stored (uppercase); searchable', async () => {
    expect((await sell('3')).body.error.code).toBe('PAPER_TICKET_REQUIRED');
    const b = await sell('3', 'bo1-1001').expect(201);
    expect(b.body.paperTicketNo).toBe('BO1-1001');
    const found = await cashier.get('/bookings?q=bo1-1001').expect(200);
    expect(found.body.data.map((x: { id: string }) => x.id)).toContain(b.body.id);
  });

  it('the same paper ticket cannot be used twice in a branch — even after void', async () => {
    const dup = await sell('4', 'BO1-1001');
    expect(dup.body.error).toMatchObject({ code: 'PAPER_TICKET_USED', details: { paperTicketNo: 'BO1-1001' } });
    const b = await sell('5', 'BO1-1002').expect(201);
    await manager.post(`/bookings/${b.body.id}/void`, { reason: 'qalad baa dhacay', refund: false }).expect(201);
    expect((await sell('5', 'BO1-1002')).body.error.code).toBe('PAPER_TICKET_USED');
    await sell('5', 'BO1-1003').expect(201);
    expect((await sell('6', 'bad no!')).status).toBe(400);
  });

  it('reservation is paid with a paper ticket; manager can correct a mistyped number', async () => {
    const r = await cashier.post('/bookings/reserve', { tripId, seatNo: '7', passengerName: 'Ballan', passengerPhone: '0634222222' }).expect(201);
    expect((await cashier.post(`/bookings/${r.body.id}/confirm`, { payment: pay })).body.error.code).toBe('PAPER_TICKET_REQUIRED');
    const c = await cashier.post(`/bookings/${r.body.id}/confirm`, { payment: pay, paperTicketNo: 'BO1-1004' }).expect(201);
    expect(c.body).toMatchObject({ status: 'CONFIRMED', paperTicketNo: 'BO1-1004' });
    const fix = await manager.patch(`/bookings/${c.body.id}`, { paperTicketNo: 'BO1-1005', reason: 'lambar khaldan' }).expect(200);
    expect(fix.body.paperTicketNo).toBe('BO1-1005');
    expect((await manager.patch(`/bookings/${c.body.id}`, { paperTicketNo: 'BO1-1001', reason: 'isku day' })).body.error.code).toBe('PAPER_TICKET_USED');
  });

  it('mode 2: paper number optional', async () => {
    await sa.put('/pricing-settings', { ticketMode: 2 }).expect(200);
    await sell('8').expect(201);
    void wajCashier;
  });
});
