import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Zaad / eDahab: macmiilku lacagta wuu soo diraa → karraanigu wuxuu qoraa transaction-ka + lambarka laga soo diray.
 * Hal transaction = hal lacag. Manager-ku dhammaadka maalinta wuu la barbar dhigaa bayaanka (reconcile).
 */
describe('Zaad / eDahab payments (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let tripId: string;

  const zaad = (reference: string, payerPhone?: string) => ({ method: 'ZAAD', currency: 'USD', reference, ...(payerPhone && { payerPhone }) });
  const sell = (seatNo: string, payment: object) =>
    cashier.post('/bookings', { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
    manager = api(app, await login(app, '0611'));
    wajCashier = api(app, await login(app, '0622'));
    wajManager = api(app, await login(app, '0621'));
    tripId = (await manager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 5 * 3600_000).toISOString() }).expect(201)).body.id;
    await cashier.post('/cash-sessions/open', { openingUsdCents: 1000 }).expect(201);
    await manager.post('/cash-sessions/open', {}).expect(201);
    await wajCashier.post('/cash-sessions/open', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('each branch has its own Zaad/eDahab number (Super Admin sets it; public can see it)', async () => {
    expect((await manager.patch(`/branches/${base.bor.id}`, { zaadNumber: '063 7000001' })).status).toBe(403);
    await sa.patch(`/branches/${base.bor.id}`, { zaadNumber: '063 7000001', edahabNumber: '065 7000001' }).expect(200);
    await sa.patch(`/branches/${base.waj.id}`, { zaadNumber: '063 7000002' }).expect(200);
    const pub = await request(app.getHttpServer()).get('/api/v1/public/branches').expect(200);
    expect(pub.body.find((b: { code: string }) => b.code === 'BOR')).toMatchObject({ zaadNumber: '063 7000001', edahabNumber: '065 7000001' });
  });

  it('Zaad payment needs the transaction number AND the sender phone; stored normalised', async () => {
    expect((await sell('3', { method: 'ZAAD', currency: 'USD' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await sell('3', zaad('zd 123 456'))).body.error.code).toBe('PAYER_PHONE_REQUIRED');
    const b = await sell('3', zaad('zd 123 456', '063 4777777')).expect(201);
    expect(b.body.payments[0]).toMatchObject({ method: 'ZAAD', reference: 'ZD123456', payerPhone: '0634777777', amountUsdCents: 300 });
    // ZAAD does not go into the cash drawer count
    const cur = await cashier.get('/cash-sessions/current').expect(200);
    expect(cur.body.summary.expectedCash.USD).toBe(1000);
  });

  it('the same Zaad transaction cannot be used twice (ticket or parcel), whatever the spacing/case', async () => {
    const again = await sell('4', zaad('ZD123 456', '0634777777'));
    expect(again.body.error).toMatchObject({ code: 'MOBILE_REFERENCE_USED', details: { usedOn: 'BOR-T-000001' } });
    const parcel = await cashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 1, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: zaad('zd123456', '0634777777'),
    });
    expect(parcel.body.error.code).toBe('MOBILE_REFERENCE_USED');
    // eDahab with the same number is a different system → allowed
    await sell('4', { method: 'EDAHAB', currency: 'USD', reference: 'ZD123456', payerPhone: '0654777777' }).expect(201);
  });

  it('cashier can check a transaction before accepting it', async () => {
    const used = await cashier.get('/payments/lookup?method=ZAAD&reference=zd123456').expect(200);
    expect(used.body).toMatchObject({ used: true, usedOn: 'BOR-T-000001' });
    const fresh = await cashier.get('/payments/lookup?method=ZAAD&reference=NEW999').expect(200);
    expect(fresh.body.used).toBe(false);
  });

  it('two cashiers entering the same Zaad SMS at the same moment → only one succeeds', async () => {
    const [a, b] = await Promise.all([sell('5', zaad('RACE-777', '0634000111')), sell('6', zaad('RACE-777', '0634000111'))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a.body.error?.code, b.body.error?.code]).toContain('MOBILE_REFERENCE_USED');
    expect(await prisma.payment.count({ where: { reference: 'RACE-777' } })).toBe(1);
  });

  it('phone reservation SMS tells the customer where to send Zaad; confirm via Zaad', async () => {
    const r = await cashier.post('/bookings/reserve', { tripId, seatNo: '7', passengerName: 'Wacaha', passengerPhone: '0634123123' }).expect(201);
    const sms = await prisma.notification.findFirstOrThrow({ where: { template: 'BOOKING_RESERVED' } });
    expect(sms.body).toContain('Zaad 063 7000001');
    expect(sms.body).toContain('eDahab 065 7000001');
    const c = await cashier.post(`/bookings/${r.body.id}/confirm`, { payment: zaad('ZD-RES-1', '0634123123') }).expect(201);
    expect(c.body.payments[0]).toMatchObject({ method: 'ZAAD', reference: 'ZD-RES-1' });
  });

  it('"paid via Zaad" marker: filter tickets by payment method', async () => {
    const z = await cashier.get(`/bookings?tripId=${tripId}&paidVia=ZAAD`).expect(200);
    expect(z.body.data).toHaveLength(3); // seat 3, the race winner (5 or 6), seat 7
    expect(z.body.data.every((b: { payments: { method: string }[] }) => b.payments.some((p) => p.method === 'ZAAD'))).toBe(true);
    const e = await cashier.get(`/bookings?tripId=${tripId}&paidVia=EDAHAB`).expect(200);
    expect(e.body.data).toHaveLength(1);
  });

  it('refund of a Zaad ticket goes back via Zaad to the same sender (no false duplicate)', async () => {
    const b = await prisma.booking.findFirstOrThrow({ where: { tripId, seatNo: '3' } });
    await manager.post(`/bookings/${b.id}/void`, { reason: 'Macmiilku wuu ka noqday', refund: true }).expect(201);
    const refund = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id, kind: 'REFUND' } });
    expect(refund).toMatchObject({ method: 'ZAAD', reference: 'ZD123456', payerPhone: '0634777777', amountUsdCents: -300 });
  });

  it('COD + storage fee can share one Zaad transaction at delivery', async () => {
    const p = await cashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 1, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'RECEIVER',
    }).expect(201);
    await prisma.parcel.update({ where: { id: p.body.id }, data: { status: 'ARRIVED', arrivedAt: new Date(Date.now() - 10 * 86400_000) } });
    const d = await wajCashier.post(`/parcels/${p.body.id}/deliver`, { pin: p.body.pickupPin, receivedByName: 'Qaataha', payment: zaad('ZD-COD-1', '0634666666') }).expect(201);
    expect(d.body.status).toBe('DELIVERED');
    const pays = await prisma.payment.findMany({ where: { parcelId: p.body.id } });
    expect(pays.map((x) => x.kind).sort()).toEqual(['PARCEL', 'STORAGE']);
    expect(pays.every((x) => x.reference === 'ZD-COD-1')).toBe(true);
  });

  it('end-of-day reconciliation: manager ticks Zaad/eDahab payments against the statement', async () => {
    expect((await cashier.get('/payments/mobile')).status).toBe(403);
    const list = await manager.get('/payments/mobile?reconciled=false').expect(200);
    expect(list.body.totals.unreconciled).toBeGreaterThanOrEqual(4);
    const item = list.body.items[0];
    expect(item).toEqual(expect.objectContaining({ method: expect.any(String), reference: expect.any(String), payerPhone: expect.any(String), receipt: expect.any(String), cashier: expect.any(String) }));
    const ids = list.body.items.filter((i: { amount: number }) => i.amount > 0).map((i: { id: string }) => i.id);
    expect((await wajManager.post('/payments/reconcile', { ids })).body.error.code).toBe('FORBIDDEN_BRANCH');
    const r = await manager.post('/payments/reconcile', { ids, note: 'Bayaanka Zaad 25/11 waa la mid' }).expect(201);
    expect(r.body.reconciled).toBe(ids.length);
    expect((await manager.post('/payments/reconcile', { ids })).body).toMatchObject({ reconciled: 0, alreadyDone: ids.length });
    const cashSale = await sell('8', { method: 'CASH', currency: 'USD' }).expect(201);
    const cashPay = await prisma.payment.findFirstOrThrow({ where: { bookingId: cashSale.body.id } });
    expect((await sa.post(`/payments/${cashPay.id}/reconcile`, {})).body.error.code).toBe('NOT_MOBILE_PAYMENT');
    expect(await prisma.auditLog.count({ where: { action: 'RECONCILE' } })).toBeGreaterThanOrEqual(1);
  });

  it('integrity flags Zaad payments not reconciled within 48h', async () => {
    const p = await sell('9', zaad('ZD-OLD-1', '0634000999')).expect(201);
    await prisma.payment.updateMany({ where: { bookingId: p.body.id }, data: { createdAt: new Date(Date.now() - 72 * 3600_000) } });
    const r = await sa.get('/reports/integrity').expect(200);
    expect(r.body.checks.mobilePaymentsUnreconciledOver48h.map((x: { reference: string }) => x.reference)).toContain('ZD-OLD-1');
  });
});
