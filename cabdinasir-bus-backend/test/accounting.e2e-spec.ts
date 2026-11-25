import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/**
 * Xisaabaadka (CashBook): mushaharka darawalka (si toos ah marka safarku gaadho), horumar/bixin/ka jarid,
 * buugga laanta (si toos ah), buugga xafiiska, P&L (laan + gaari), biilasha.
 */
describe('Accounting: driver pay, cashbook, P&L (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let manager: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let driver2: string;
  let tripA: string;
  let tripB: string;

  const sell = (tripId: string, seatNo: string) =>
    cashier.post('/bookings', { tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
  const parcelOn = async (tripId: string) => {
    const p = await cashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 12, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' },
    }).expect(201);
    await cashier.post(`/parcels/${p.body.id}/load`, { tripId }).expect(201);
    return p.body;
  };
  const complete = async (tripId: string) => {
    await manager.patch(`/trips/${tripId}/status`, { status: 'DEPARTED' }).expect(200);
    await wajManager.patch(`/trips/${tripId}/status`, { status: 'ARRIVED' }).expect(200);
  };
  const expected = async () => (await cashier.get('/cash-sessions/current').expect(200)).body.summary.expectedCash.USD as number;

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
    manager = api(app, await login(app, '0611'));
    wajManager = api(app, await login(app, '0621'));
    wajCashier = api(app, await login(app, '0622'));
    await sa.put('/exchange-rates/today', { usdToSlsh: 8500 }).expect(200);
    const v2 = await prisma.vehicle.create({ data: { plate: 'SL-2', model: 'Hiace', seatLayout: (await prisma.vehicle.findFirstOrThrow()).seatLayout as object, capacity: 14 } });
    driver2 = (await manager.post('/drivers', { name: 'Muuse', phone: '0633888' }).expect(201)).body.id;
    tripA = (await manager.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3600_000).toISOString() }).expect(201)).body.id;
    tripB = (await manager.post('/trips', { routeId: base.route.id, vehicleId: v2.id, driverId: driver2, departureAt: new Date(Date.now() + 1800_000).toISOString() }).expect(201)).body.id;
    await cashier.post('/cash-sessions/open', { openingUsdCents: 1000 }).expect(201);
    await manager.post('/cash-sessions/open', { openingUsdCents: 5000 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('pay rules: managers only; percentage needs bps', async () => {
    expect((await cashier.put(`/driver-pay/${base.driver.id}/rule`, { type: 'PER_TRIP', amountCents: 500 })).status).toBe(403);
    expect((await manager.put(`/driver-pay/${driver2}/rule`, { type: 'PERCENT_TRIP_INCOME' })).body.error.code).toBe('BPS_REQUIRED');
    await manager.put(`/driver-pay/${base.driver.id}/rule`, { type: 'PER_TRIP', amountCents: 500, effectiveFrom: new Date(Date.now() - 86400_000).toISOString() }).expect(200);
    await manager.put(`/driver-pay/${driver2}/rule`, { type: 'PERCENT_TRIP_INCOME', bps: 1000, effectiveFrom: new Date(Date.now() - 86400_000).toISOString() }).expect(200);
    // Wajaale manager cannot change a Boorama driver
    expect((await wajManager.put(`/driver-pay/${driver2}/rule`, { type: 'PER_TRIP', amountCents: 1 })).body.error.code).toBe('FORBIDDEN_BRANCH');
  });

  it('trip arrival credits the driver automatically (fixed per trip and % of trip income)', async () => {
    await sell(tripA, '3');
    await sell(tripA, '4');
    await sell(tripB, '3');
    await sell(tripB, '4');
    await parcelOn(tripB);
    await complete(tripA);
    await complete(tripB);
    const eA = await prisma.driverEarning.findMany({ where: { tripId: tripA } });
    expect(eA).toHaveLength(1);
    expect(eA[0].amountCents).toBe(500);
    const eB = await prisma.driverEarning.findFirstOrThrow({ where: { tripId: tripB } });
    // 10% × (tickets $6.00 + parcel $4.60) = $1.06
    expect(eB.amountCents).toBe(106);
    expect(eB.basis).toMatchObject({ ticketsUsdCents: 600, parcelsUsdCents: 460 });
  });

  it('advance from the drawer reduces cash and the driver balance; deduction moves no cash; void restores', async () => {
    const before = await expected();
    const big = await manager.post(`/driver-pay/${base.driver.id}/payments`, { kind: 'ADVANCE', amountCents: 999999 });
    expect(big.body.error.code).toBe('INSUFFICIENT_CASH');
    const adv = await manager.post(`/driver-pay/${base.driver.id}/payments`, { kind: 'ADVANCE', amountCents: 200, note: 'Horumar' }).set('Idempotency-Key', 'drv-adv-0001').expect(201);
    const again = await manager.post(`/driver-pay/${base.driver.id}/payments`, { kind: 'ADVANCE', amountCents: 200 }).set('Idempotency-Key', 'drv-adv-0001').expect(201);
    expect(again.body.id).toBe(adv.body.id);
    const mgrSession = (await manager.get('/cash-sessions/current').expect(200)).body;
    expect(mgrSession.summary.byMethod.find((m: { method: string }) => m.method === 'CASH').amount).toBe(-200);
    await manager.post(`/driver-pay/${base.driver.id}/payments`, { kind: 'DEDUCTION', amountCents: 100, note: 'Muraayad jabtay' }).expect(201);
    expect(await expected()).toBe(before); // cashier drawer untouched

    let st = await manager.get(`/driver-pay/${base.driver.id}/statement`).expect(200);
    expect(st.body).toMatchObject({ earnedCents: 500, paidCents: 300, closingCents: 200, trips: 1 });
    expect(st.body.lines.map((l: { type: string }) => l.type)).toEqual(['TRIP', 'ADVANCE', 'DEDUCTION']);

    const v = await manager.get(`/driver-pay/payments/${adv.body.id}/voucher`).expect(200);
    expect(v.body).toMatchObject({ kind: 'ADVANCE', amountCents: 200, method: 'CASH', currency: 'USD', paidAmount: 200, earnedTotalCents: 500, paidTotalCents: 200, balanceBeforeCents: 500, balanceAfterCents: 300 });
    expect(v.body.driver.name).toBeTruthy();
    expect((await manager.get('/driver-pay/payments/00000000-0000-0000-0000-000000000000/voucher')).status).toBe(404);

    await manager.post(`/driver-pay/payments/${adv.body.id}/void`, { reason: 'qalad baa dhacay' }).expect(201);
    st = await manager.get(`/driver-pay/${base.driver.id}/statement`).expect(200);
    expect(st.body.closingCents).toBe(400);
    const m2 = (await manager.get('/cash-sessions/current').expect(200)).body;
    expect(m2.summary.expectedCash.USD).toBe(5000);
  });

  it('super admin pays from the head office book; bonus; driver summary', async () => {
    const p = await sa.post(`/driver-pay/${driver2}/payments`, { kind: 'PAYOUT', amountCents: 50, note: 'Mushahar' }).expect(201);
    expect(p.body.ledgerEntryId).toBeTruthy();
    expect((await sa.post(`/ledger/entries/${p.body.ledgerEntryId}/void`, { reason: 'x x x' })).body.error.code).toBe('USE_DRIVER_PAY_VOID');
    await manager.post(`/driver-pay/${driver2}/bonus`, { amountCents: 300, note: 'Ciid' }).expect(201);
    const sum = await manager.get('/driver-pay').expect(200);
    const d2 = sum.body.drivers.find((d: { driverId: string }) => d.driverId === driver2);
    expect(d2).toMatchObject({ earnedCents: 406, paidCents: 50, balanceCents: 356, trips: 1 });
    expect(d2.rule).toMatchObject({ type: 'PERCENT_TRIP_INCOME', bps: 1000 });
  });

  it('monthly salary accrues once per month', async () => {
    const d3 = (await manager.post('/drivers', { name: 'Cabdi', phone: '0633777' }).expect(201)).body.id;
    await manager.put(`/driver-pay/${d3}/rule`, { type: 'MONTHLY_SALARY', amountCents: 30000, effectiveFrom: '2026-01-01T00:00:00Z' }).expect(200);
    expect((await manager.post('/driver-pay/run-monthly', { period: '2026-10' })).status).toBe(403);
    expect((await sa.post('/driver-pay/run-monthly', { period: '2026-10' }).expect(201)).body.created).toBe(1);
    expect((await sa.post('/driver-pay/run-monthly', { period: '2026-10' }).expect(201)).body.created).toBe(0);
    const st = await manager.get(`/driver-pay/${d3}/statement?from=2026-01-01`).expect(200);
    expect(st.body.closingCents).toBe(30000);
  });

  it('branch cashbook: every payment appears automatically with running balance per account', async () => {
    await cashier.post('/expenses', { category: 'FUEL', description: 'Shidaal SL-1', amount: 300, currency: 'USD', tripId: tripA }).expect(201);
    const b = await manager.get('/ledger/branch').expect(200);
    const kinds = b.body.lines.map((l: { kind: string }) => l.kind);
    expect(kinds).toEqual(expect.arrayContaining(['TICKET', 'PARCEL', 'EXPENSE', 'DRIVER_PAY']));
    const last = b.body.lines.filter((l: { account: string }) => l.account === 'CASH_USD').at(-1);
    expect(last.balance).toBe(b.body.closing.CASH_USD);
    // closing = sum of all cash USD payments today (no opening before today)
    const agg = await prisma.payment.aggregate({ where: { branchId: base.bor.id, method: 'CASH', currency: 'USD' }, _sum: { amount: true } });
    expect(b.body.closing.CASH_USD).toBe(agg._sum.amount);
    const csv = await manager.get('/ledger/branch?format=csv').expect(200);
    expect(csv.text).toContain('balance');
    expect((await cashier.get('/ledger/branch')).status).toBe(403);
  });

  it('head office book: confirmed deposits + manual entries; categories validated', async () => {
    const dep = await cashier.post('/deposits', { target: 'HEAD_OFFICE', amount: 500, currency: 'USD' }).expect(201);
    await sa.post(`/deposits/${dep.body.id}/confirm`).expect(201);
    expect((await sa.post('/ledger/entries', { direction: 'IN', category: 'RENT', description: 'x x', amount: 1, currency: 'USD' })).body.error.code).toBe('INVALID_CATEGORY');
    expect((await manager.post('/ledger/entries', { direction: 'IN', category: 'OTHER_INCOME', description: 'x x', amount: 1, currency: 'USD' })).status).toBe(403);
    await sa.post('/ledger/entries', { direction: 'IN', category: 'OTHER_INCOME', description: 'Kiro dukaan', amount: 5000, currency: 'USD' }).expect(201);
    await sa.post('/ledger/entries', { direction: 'OUT', category: 'RENT', description: 'Kirada xafiiska Boorama', amount: 2000, currency: 'USD', branchId: base.bor.id }).expect(201);
    await sa.post('/ledger/entries', { direction: 'OUT', category: 'MAINTENANCE', description: 'Taayir SL-1', amount: 1500, currency: 'USD', vehicleId: base.vehicle.id }).expect(201);
    await sa.post('/ledger/entries', { direction: 'IN', category: 'CAPITAL', description: 'Raasumaal', amount: 100000, currency: 'USD' }).expect(201);
    const o = await sa.get('/ledger/office').expect(200);
    expect(o.body.lines.map((l: { category: string }) => l.category)).toEqual(expect.arrayContaining(['BRANCH_DEPOSIT', 'OTHER_INCOME', 'RENT', 'CAPITAL', 'DRIVER_PAY']));
    // 500 + 5000 - 2000 - 1500 + 100000 - 50 (driver payout)
    expect(o.body.closing.USD).toBe(101950);
  });

  it('profit & loss: income − expenses − driver pay; capital is not income; per vehicle', async () => {
    const r = await sa.get(`/reports/profit-loss?branchId=${base.bor.id}`).expect(200);
    const inc = Object.fromEntries(r.body.income.map((x: { key: string; usdCents: number }) => [x.key, x.usdCents]));
    expect(inc.TICKET).toBe(1200);
    expect(inc.PARCEL).toBe(460);
    expect(inc.OTHER_INCOME).toBeUndefined(); // not attributed to Boorama
    const exp = Object.fromEntries(r.body.expenses.map((x: { key: string; usdCents: number }) => [x.key, x.usdCents]));
    expect(exp.FUEL).toBe(300);
    expect(exp.RENT).toBe(2000);
    // trip A + trip B + bonus (October salary is dated in October → not in this month's P&L)
    expect(r.body.driverPayUsdCents).toBe(500 + 106 + 300);
    expect(r.body.totals.netProfitUsdCents).toBe(r.body.totals.incomeUsdCents - r.body.totals.expensesUsdCents - r.body.totals.driverPayUsdCents);
    const all = await sa.get('/reports/profit-loss').expect(200);
    expect(all.body.income.find((x: { key: string }) => x.key === 'OTHER_INCOME').usdCents).toBe(5000);
    expect(all.body.income.find((x: { key: string }) => x.key === 'CAPITAL')).toBeUndefined();
    const sl1 = all.body.byVehicle.find((v: { plate: string }) => v.plate === 'SL-1');
    expect(sl1).toMatchObject({ trips: 1, incomeUsdCents: 600, driverPayUsdCents: 500 });
    expect(sl1.expensesUsdCents).toBe(300 + 1500); // fuel on trip + maintenance
    expect(sl1.profitUsdCents).toBe(600 - 1800 - 500);
    const csv = await manager.get('/reports/profit-loss?format=csv').expect(200);
    expect(csv.text).toContain('NET_PROFIT');
  });

  it('bill photo on an expense: uploaded by the branch, hidden from other branches', async () => {
    const e = await prisma.expense.findFirstOrThrow();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d80000000049454e44ae426082', 'hex');
    const s = app.getHttpServer();
    const tok = await login(app, '0612');
    const up = await request(s).post(`/api/v1/expenses/${e.id}/attachment`).set('Authorization', `Bearer ${tok}`).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
    expect(up.body.attachmentUrl).toMatch(/^bills\//);
    await request(s).get(`/api/v1/expenses/${e.id}/attachment`).set('Authorization', `Bearer ${tok}`).expect(200);
    expect((await wajCashier.get(`/expenses/${e.id}/attachment`)).body.error.code).toBe('FORBIDDEN_BRANCH');
  });
});
