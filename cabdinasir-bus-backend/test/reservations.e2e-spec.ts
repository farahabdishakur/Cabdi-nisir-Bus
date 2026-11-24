import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';
import { JobsService } from '../src/jobs/jobs.service';

/**
 * Ballan taleefan: macmiilku wuu soo wacayaa → kursi lacag la'aan ah (RESERVED) ilaa 60 daqiiqo ka hor bixitaanka
 * → xafiiska ayuu ku bixiyaa (CONFIRMED) → haddii kale kursigu wuu furmayaa (EXPIRED).
 */
describe('Phone reservations (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let tripId: string;

  const reserve = (seatNo: string, phone = '0634111111', trip = tripId) =>
    cashier.post('/bookings/reserve', { tripId: trip, seatNo, passengerName: 'Wacaha ' + seatNo, passengerPhone: phone });
  const newTrip = async (minutesAhead: number) =>
    (await manager.post('/trips', {
      routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
    }).expect(201)).body.id as string;

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
    manager = api(app, await login(app, '0611'));
    tripId = await newTrip(5 * 60);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('cashier reserves a seat by phone — no payment, no open drawer needed; SMS sent', async () => {
    const r = await reserve('3').expect(201);
    expect(r.body).toMatchObject({ status: 'RESERVED', seatNo: '3', priceCents: 300, receiptNo: 'BOR-T-000001' });
    expect(r.body.payments).toHaveLength(0);
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(new Date(r.body.reservedUntil).getTime()).toBe(trip.departureAt.getTime() - 60 * 60_000);
    const sms = await prisma.notification.findFirstOrThrow({ where: { template: 'BOOKING_RESERVED' } });
    expect(sms.to).toBe('+252634111111');
    expect(sms.body).toContain('BOR-T-000001');
    expect(sms.body).toContain('$3.00');
  });

  it('a reserved seat is taken: shown as RESERVED, cannot be sold or reserved again', async () => {
    const map = await cashier.get(`/trips/${tripId}/seats`).expect(200);
    const seat = map.body.seats.find((s: { seatNo: string }) => s.seatNo === '3');
    expect(seat.state).toBe('RESERVED');
    expect(seat.reservedUntil).toBeTruthy();
    expect((await reserve('3', '0634999999')).body.error.code).toBe('SEAT_TAKEN');
    await cashier.post('/cash-sessions/open', {}).expect(201);
    const sell = await cashier.post('/bookings', { tripId, seatNo: '3', passengerName: 'Kale', passengerPhone: '0634222222', payment: { method: 'CASH', currency: 'USD' } });
    expect(sell.body.error.code).toBe('SEAT_TAKEN');
    const list = await manager.get('/trips').expect(200);
    expect(list.body.find((x: { id: string }) => x.id === tripId).seatsReserved).toBe(1);
  });

  it('customer comes and pays → CONFIRMED with payment; confirming twice fails', async () => {
    const b = await prisma.booking.findFirstOrThrow({ where: { tripId, seatNo: '3' } });
    const c = await cashier.post(`/bookings/${b.id}/confirm`, { payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect(c.body).toMatchObject({ status: 'CONFIRMED', receiptNo: 'BOR-T-000001' });
    expect(c.body.payments[0]).toMatchObject({ kind: 'TICKET', amountUsdCents: 300 });
    expect(c.body.confirmedAt).toBeTruthy();
    expect((await cashier.post(`/bookings/${b.id}/confirm`, { payment: { method: 'CASH', currency: 'USD' } })).body.error.code).toBe('BOOKING_NOT_ACTIVE');
  });

  it('limit per phone per trip', async () => {
    await sa.put('/pricing-settings', { maxReservationsPerPhone: 2 }).expect(200);
    await reserve('5', '0634555000').expect(201);
    await reserve('6', '0634555000').expect(201);
    expect((await reserve('7', '0634555000')).body.error.code).toBe('RESERVATION_LIMIT');
    await sa.put('/pricing-settings', { maxReservationsPerPhone: 4 }).expect(200);
  });

  it('unpaid in time → seat frees itself; late confirm is refused', async () => {
    const b = await prisma.booking.findFirstOrThrow({ where: { tripId, seatNo: '5' } });
    await prisma.booking.update({ where: { id: b.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    const map = await cashier.get(`/trips/${tripId}/seats`).expect(200);
    expect(map.body.seats.find((s: { seatNo: string }) => s.seatNo === '5').state).toBe('AVAILABLE');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('EXPIRED');
    expect((await cashier.post(`/bookings/${b.id}/confirm`, { payment: { method: 'CASH', currency: 'USD' } })).body.error.code).toBe('RESERVATION_EXPIRED');
    await cashier.post('/bookings', { tripId, seatNo: '5', passengerName: 'Cusub', passengerPhone: '0634222222', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
  });

  it('background job expires due reservations', async () => {
    const r = await reserve('8', '0634888000').expect(201);
    await prisma.booking.update({ where: { id: r.body.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    const res = await app.get(JobsService).runExpireReservations();
    expect(res.expired).toBe(1);
  });

  it('customer cancels by phone → cashier releases the seat (no money involved)', async () => {
    const r = await reserve('9', '0634999000').expect(201);
    const c = await cashier.post(`/bookings/${r.body.id}/cancel-reservation`, { reason: 'Macmiilku wuu ka noqday' }).expect(201);
    expect(c.body.status).toBe('VOIDED');
    await reserve('9', '0634999001').expect(201);
  });

  it('too close to departure → must pay now; cutoff 0 turns reservations off', async () => {
    const soon = await newTrip(30);
    expect((await reserve('1', '0634111222', soon)).body.error.code).toBe('RESERVATION_CLOSED');
    await sa.put('/pricing-settings', { reservationCutoffMinutes: 0 }).expect(200);
    expect((await reserve('10')).body.error.code).toBe('RESERVATIONS_DISABLED');
    await sa.put('/pricing-settings', { reservationCutoffMinutes: 60 }).expect(200);
  });

  it('reports count only paid tickets; integrity does not flag reservations; public shows seats taken', async () => {
    const rev = await manager.get('/reports/revenue').expect(200);
    expect(rev.body.perBranch[0].byKind.TICKET).toBe(600); // seat 3 + seat 5
    const integ = await sa.get('/reports/integrity').expect(200);
    expect(integ.body.checks.ticketsWithoutPayment).toHaveLength(0);
    const m = await manager.get(`/trips/${tripId}/manifest`).expect(200);
    expect(m.body.totals.passengers).toBe(2);
    expect(m.body.totals.reservedUnpaid).toBeGreaterThanOrEqual(2); // seats 6, 9
    const dep = (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).departureAt;
    const day = new Date(dep.getTime() + 3 * 3600_000).toISOString().slice(0, 10); // taariikhda Africa/Mogadishu
    const pub = await request(app.getHttpServer()).get(`/api/v1/public/trips?from=BOR&date=${day}`).expect(200);
    const t = pub.body.find((x: { seatsAvailable: number }) => x.seatsAvailable < 14);
    expect(t).toBeDefined();
  });

  it('departure: unpaid reservations become no-shows (EXPIRED)', async () => {
    await manager.patch(`/trips/${tripId}/status`, { status: 'DEPARTED' }).expect(200);
    expect(await prisma.booking.count({ where: { tripId, status: 'RESERVED' } })).toBe(0);
    expect(await prisma.booking.count({ where: { tripId, status: 'EXPIRED' } })).toBeGreaterThanOrEqual(3);
  });

  it('a trip with only reservations can be cancelled (reservations released)', async () => {
    const t = await newTrip(10 * 60);
    await reserve('2', '0634777000', t).expect(201);
    await manager.patch(`/trips/${t}/status`, { status: 'CANCELLED', reason: 'Gaari ma jiro' }).expect(200);
    expect(await prisma.booking.count({ where: { tripId: t, status: 'RESERVED' } })).toBe(0);
  });
});
