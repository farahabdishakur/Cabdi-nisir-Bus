import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';
import { SMS_PROVIDER, LogSmsProvider } from '../src/notifications/sms.provider';
import { NotificationsService } from '../src/notifications/notifications.service';
import { JobsService } from '../src/jobs/jobs.service';

/**
 * Hawlaha maalinlaha ah ee ka baxsan iibka: SMS, kharash, deposit, codsiyada void, beddelka tigidhka,
 * tracking dadweyne, offline sync, warbixinada CSV, sawirada, jadwal badan, jobs.
 */
describe('Operations (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let borCashier: ReturnType<typeof api>;
  let borManager: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let tripId: string;
  let sms: LogSmsProvider;

  const parcelBody = (over: object = {}) => ({
    toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 3, pieces: 1,
    senderName: 'Xasan Cali', senderPhone: '0634555555', receiverName: 'Hodan Axmed', receiverPhone: '0634666666',
    payer: 'SENDER', payment: { method: 'CASH', currency: 'USD' }, ...over,
  });
  const ticket = (seatNo: string, over: object = {}) => ({
    tripId, seatNo, passengerName: 'Rakaab ' + seatNo, passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' }, ...over,
  });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sms = app.get(SMS_PROVIDER);
    sa = api(app, await login(app, '0600'));
    borCashier = api(app, await login(app, '0612'));
    borManager = api(app, await login(app, '0611'));
    wajCashier = api(app, await login(app, '0622'));
    await sa.put('/exchange-rates/today', { usdToSlsh: 8500 }).expect(200);
    const t = await borManager
      .post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 3600_000).toISOString() })
      .expect(201);
    tripId = t.body.id;
    await borCashier.post('/cash-sessions/open', { openingUsdCents: 2000, openingSlsh: 100000 }).expect(201);
    await borManager.post('/cash-sessions/open', {}).expect(201);
    await wajCashier.post('/cash-sessions/open', {}).expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('company profile is public; only super admin edits it', async () => {
    const pub = await request(app.getHttpServer()).get('/api/v1/company').expect(200);
    expect(pub.body.parcelRules).toHaveLength(5);
    expect((await borManager.put('/company', { receiptFooter: 'x' })).status).toBe(403);
    const upd = await sa.put('/company', { receiptFooter: 'Mahadsanid!' }).expect(200);
    expect(upd.body.receiptFooter).toBe('Mahadsanid!');
    expect(upd.body.name).toBe('Cabdinasir Bus');
  });

  it('SMS: parcel registration queues receiver SMS with PIN; worker sends and redacts PIN', async () => {
    const p = await borCashier.post('/parcels', parcelBody()).expect(201);
    const queued = await prisma.notification.findMany({ where: { parcelId: p.body.id } });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ to: '+252634666666', template: 'PARCEL_REGISTERED', status: 'PENDING' });
    expect(queued[0].body).toContain(`PIN: ${p.body.pickupPin}`);

    const res = await app.get(NotificationsService).processPending();
    expect(res.sent).toBeGreaterThanOrEqual(1);
    expect(sms.sent.at(-1)?.body).toContain(p.body.trackingCode);
    const after = await prisma.notification.findUniqueOrThrow({ where: { id: queued[0].id } });
    expect(after.status).toBe('SENT');
    expect(after.body).toContain('PIN: ****');

    const list = await borManager.get(`/notifications?parcelId=${p.body.id}`).expect(200);
    expect(list.body[0].body).not.toMatch(/PIN: \d{4}/);
  });

  it('SMS: landline numbers are skipped (cannot receive SMS)', async () => {
    const p = await borCashier.post('/parcels', parcelBody({ receiverPhone: '610700' })).expect(201);
    expect(await prisma.notification.count({ where: { parcelId: p.body.id } })).toBe(0);
  });

  it('expenses: cannot exceed drawer cash; reduce expected cash; manager void restores it', async () => {
    const big = await borCashier.post('/expenses', { category: 'FUEL', description: 'Shidaal', amount: 999999, currency: 'USD' });
    expect(big.body.error.code).toBe('INSUFFICIENT_CASH');
    const before = (await borCashier.get('/cash-sessions/current')).body.summary.expectedCash.USD;
    const e = await borCashier.post('/expenses', { category: 'FUEL', description: 'Shidaal gaariga SL-1', amount: 500, currency: 'USD', tripId }).expect(201);
    expect(e.body.payment.amount).toBe(-500);
    expect((await borCashier.get('/cash-sessions/current')).body.summary.expectedCash.USD).toBe(before - 500);
    expect((await borCashier.post(`/expenses/${e.body.id}/void`, { reason: 'qalad' })).status).toBe(403);
    await borManager.post(`/expenses/${e.body.id}/void`, { reason: 'qalad baa dhacay' }).expect(201);
    expect((await borCashier.get('/cash-sessions/current')).body.summary.expectedCash.USD).toBe(before);
    // real expense stays for reports
    await borCashier.post('/expenses', { category: 'DRIVER_ALLOWANCE', description: 'Darawalka', amount: 30000, currency: 'SLSH' }).expect(201);
  });

  it('deposits: move cash to head office; super admin confirms; not counted as revenue', async () => {
    const d = await borCashier.post('/deposits', { target: 'HEAD_OFFICE', amount: 1000, currency: 'USD', note: 'Lacagta maanta' }).expect(201);
    expect((await borManager.post(`/deposits/${d.body.id}/confirm`)).status).toBe(403);
    const pending = await sa.get('/deposits?unconfirmed=true').expect(200);
    expect(pending.body.map((x: { id: string }) => x.id)).toContain(d.body.id);
    await sa.post(`/deposits/${d.body.id}/confirm`).expect(201);

    const rev = await sa.get(`/reports/revenue?branchId=${base.bor.id}`).expect(200);
    const bor = rev.body.perBranch[0];
    expect(bor.byKind.DEPOSIT).toBeUndefined();
    expect(bor.expensesUsdCents).toBeGreaterThan(0);
    expect(bor.netUsdCents).toBe(bor.totalUsdCents - bor.expensesUsdCents);

    const close = await borManager.get('/reports/daily-close').expect(200);
    expect(close.body.depositsUsdCents).toBe(1000);
    expect(close.body.deposits[0].confirmed).toBe(true);
    expect(close.body.expenses.some((x: { voided: boolean }) => x.voided)).toBe(true);
  });

  it('void requests: cashier asks, cannot self-approve, manager approves → ticket voided', async () => {
    const b = await borCashier.post('/bookings', ticket('6')).expect(201);
    const r = await borCashier.post('/void-requests', { entity: 'BOOKING', entityId: b.body.id, reason: 'Rakaabku wuu baxay', refund: true }).expect(201);
    const dup = await borCashier.post('/void-requests', { entity: 'BOOKING', entityId: b.body.id, reason: 'mar labaad' });
    expect(dup.body.error.code).toBe('REQUEST_PENDING');
    expect((await borCashier.post(`/void-requests/${r.body.id}/approve`, {})).status).toBe(403);
    const other = await wajCashier.post('/void-requests', { entity: 'BOOKING', entityId: b.body.id, reason: 'laan kale' });
    expect(other.body.error.code).toBe('FORBIDDEN_BRANCH');
    const ok = await borManager.post(`/void-requests/${r.body.id}/approve`, { note: 'OK' }).expect(201);
    expect(ok.body.result.status).toBe('VOIDED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.body.id } })).status).toBe('VOIDED');
    const again = await borManager.post(`/void-requests/${r.body.id}/reject`, {});
    expect(again.body.error.code).toBe('REQUEST_DECIDED');
  });

  it('transfer: change to a front seat requires paying the difference; seat conflicts blocked', async () => {
    const b = await borCashier.post('/bookings', ticket('7')).expect(201);
    await borCashier.post('/bookings', ticket('8')).expect(201);
    const taken = await borCashier.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '8' });
    expect(taken.body.error.code).toBe('SEAT_TAKEN');
    const noPay = await borCashier.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '1' });
    expect(noPay.body.error).toMatchObject({ code: 'PAYMENT_REQUIRED', details: { diffCents: 50 } });
    const ok = await borCashier.post(`/bookings/${b.body.id}/transfer`, { tripId, seatNo: '1', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    expect(ok.body).toMatchObject({ seatNo: '1', priceCents: 350, transferredFromTripId: tripId });
    expect(ok.body.payments.map((p: { amountUsdCents: number }) => p.amountUsdCents).sort()).toEqual([300, 50].sort());
    // seat 7 is free again
    await borCashier.post('/bookings', ticket('7')).expect(201);
  });

  it('reprint is counted and audited', async () => {
    const b = await borCashier.post('/bookings', ticket('9')).expect(201);
    const r = await borCashier.post(`/bookings/${b.body.id}/reprint`).expect(201);
    expect(r.body.printCount).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: 'bookings', entityId: b.body.id, action: 'REPRINT' } })).toBe(1);
  });

  it('public tracking needs code + last 4 phone digits and hides personal data', async () => {
    const p = await borCashier.post('/parcels', parcelBody({ payer: 'RECEIVER', payment: undefined })).expect(201);
    const s = app.getHttpServer();
    await request(s).get(`/api/v1/public/track/${p.body.trackingCode}?phone=0000`).expect(404);
    const ok = await request(s).get(`/api/v1/public/track/${p.body.trackingCode.toLowerCase()}?phone=6666`).expect(200);
    expect(ok.body).toMatchObject({ status: 'REGISTERED', from: 'Boorama', to: 'Wajaale', amountDueCents: p.body.feeCents });
    expect(JSON.stringify(ok.body)).not.toContain('Hodan');
    expect(JSON.stringify(ok.body)).not.toContain('0634666666');
    const br = await request(s).get('/api/v1/public/branches').expect(200);
    expect(br.body).toHaveLength(2);
  });

  it('customer lookup suggests names used before for a phone', async () => {
    const r = await borCashier.get('/customers/lookup?phone=0634666666').expect(200);
    expect(r.body.names[0]).toMatchObject({ name: 'Hodan Axmed' });
    expect(r.body.names[0].times).toBeGreaterThanOrEqual(2);
  });

  it('offline sync: bootstrap data; batch upload is idempotent and keeps offline PIN/time', async () => {
    const boot = await borCashier.get('/sync/bootstrap').expect(200);
    expect(boot.body).toMatchObject({ user: { role: 'CASHIER' } });
    expect(boot.body.categories.length).toBeGreaterThan(0);
    expect(boot.body.todayTrips.length).toBeGreaterThanOrEqual(0);
    expect(boot.body.exchangeRate.usdToSlsh).toBe(8500);

    const offlineAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const items = [
      { idempotencyKey: 'offline-0001', offlineCreatedAt: offlineAt, pickupPin: '4321', parcel: parcelBody() },
      { idempotencyKey: 'offline-0002', offlineCreatedAt: offlineAt, parcel: parcelBody({ categoryId: base.banned.id }) },
    ];
    const r1 = await borCashier.post('/sync/parcels', { items }).expect(201);
    expect(r1.body).toMatchObject({ synced: 1, failed: 1 });
    expect(r1.body.results[1].error.code).toBe('PARCEL_PROHIBITED');
    const r2 = await borCashier.post('/sync/parcels', { items: [items[0]] }).expect(201);
    expect(r2.body.results[0]).toMatchObject({ ok: true, replayed: true, trackingCode: r1.body.results[0].trackingCode });
    expect(await prisma.parcel.count({ where: { idempotencyKey: 'offline-0001' } })).toBe(1);
    const saved = await prisma.parcel.findUniqueOrThrow({ where: { idempotencyKey: 'offline-0001' } });
    expect(saved.offlineCreatedAt?.toISOString()).toBe(offlineAt);
    const n = await prisma.notification.findFirstOrThrow({ where: { parcelId: saved.id } });
    expect(n.body).toContain('PIN: 4321');
  });

  it('parcel photo: only images, stored and served to the right branches', async () => {
    const p = await borCashier.post('/parcels', parcelBody()).expect(201);
    const s = app.getHttpServer();
    const auth = (r: request.Test, t: string) => r.set('Authorization', `Bearer ${t}`);
    const tok = await login(app, '0612');
    const bad = await auth(request(s).post(`/api/v1/parcels/${p.body.id}/photo`), tok).attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(bad.body.error.code).toBe('INVALID_FILE_TYPE');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d80000000049454e44ae426082', 'hex');
    const up = await auth(request(s).post(`/api/v1/parcels/${p.body.id}/photo`), tok).attach('file', png, { filename: 'p.png', contentType: 'image/png' }).expect(201);
    expect(up.body.photoUrl).toMatch(/^parcels\/.+\.png$/);
    const get = await auth(request(s).get(`/api/v1/parcels/${p.body.id}/photo`), await login(app, '0622')).expect(200);
    expect(get.headers['content-type']).toContain('image/png');
  });

  it('reports: CSV export and cashier performance', async () => {
    const csv = await borManager.get('/reports/occupancy?format=csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('route,vehicle,driver,capacity,sold,occupancyPct');
    const perf = await borManager.get('/reports/cashiers').expect(200);
    const cashier = perf.body.cashiers.find((c: { role: string }) => c.role === 'CASHIER');
    expect(cashier.tickets).toBeGreaterThan(0);
    expect(cashier.parcels).toBeGreaterThan(0);
  });

  it('bulk trips: each one validated separately', async () => {
    const day = Date.now() + 3 * 86400_000;
    const r = await borManager.post('/trips/bulk', {
      trips: [
        { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(day).toISOString() },
        { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(day + 3600_000).toISOString() },
        { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(day + 6 * 3600_000).toISOString() },
      ],
    }).expect(201);
    expect(r.body.created).toBe(2);
    expect(r.body.results[1].error.code).toBe('SCHEDULE_CLASH');
  });

  it('jobs: cleanup expired holds and send pickup reminders for old arrivals', async () => {
    await prisma.seatHold.create({ data: { tripId, seatNo: '14', userId: 'x', expiresAt: new Date(Date.now() - 1000) } });
    const jobs = app.get(JobsService);
    expect((await jobs.runCleanup()).seatHolds).toBe(1);

    const p = await borCashier.post('/parcels', parcelBody()).expect(201);
    await prisma.parcel.update({ where: { id: p.body.id }, data: { status: 'ARRIVED', arrivedAt: new Date(Date.now() - 4 * 86400_000) } });
    const r = await jobs.runReminders();
    expect(r.queued).toBe(1);
    expect(await prisma.notification.count({ where: { parcelId: p.body.id, template: 'PARCEL_REMINDER' } })).toBe(1);
    expect((await jobs.runReminders()).queued).toBe(0); // not again so soon
  });

  it('logout-all revokes every refresh token', async () => {
    const s = app.getHttpServer();
    const l1 = await request(s).post('/api/v1/auth/login').send({ phone: '0622', password: 'Test1234!' }).expect(200);
    await api(app, l1.body.accessToken).post('/auth/logout-all').expect(204);
    await request(s).post('/api/v1/auth/refresh').send({ refreshToken: l1.body.refreshToken }).expect(401);
  });
});
