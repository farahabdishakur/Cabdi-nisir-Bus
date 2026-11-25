import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { api, createApp, login, resetDb, seedBase } from './helpers';

/** Logo-ga shirkadda + ilaalinta qaabka kuraasta baabuurka (rakaab kursi la'aan ha noqon). */
describe('Admin data: logo, vehicle seat layouts (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d80000000049454e44ae426082', 'hex');

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('logo: super admin uploads PNG; served publicly without login; SVG/text refused', async () => {
    const s = app.getHttpServer();
    await request(s).get('/api/v1/public/logo').expect(404);
    const tok = await login(app, '0600');
    const bad = await request(s).post('/api/v1/company/logo').set('Authorization', `Bearer ${tok}`).attach('file', Buffer.from('<svg onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(bad.body.error.code).toBe('INVALID_FILE_TYPE');
    const notAdmin = await request(s).post('/api/v1/company/logo').set('Authorization', `Bearer ${await login(app, '0611')}`).attach('file', png, { filename: 'l.png', contentType: 'image/png' });
    expect(notAdmin.status).toBe(403);
    const up = await request(s).post('/api/v1/company/logo').set('Authorization', `Bearer ${tok}`).attach('file', png, { filename: 'l.png', contentType: 'image/png' }).expect(201);
    expect(up.body.logoUrl).toMatch(/^\/api\/v1\/public\/logo\?v=[0-9a-f]{12}$/);
    const img = await request(s).get(up.body.logoUrl).expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    expect((await cashier.get('/sync/bootstrap').expect(200)).body.company.logoUrl).toBe(up.body.logoUrl);
    // PUT company cannot point the logo anywhere else
    expect((await sa.put('/company', { logoUrl: 'https://evil.example/x.png' })).status).toBe(400);
    await sa.del('/company/logo').expect(200);
    await request(s).get('/api/v1/public/logo').expect(404);
  });

  it('seat layout: cannot remove a seat that has a booking on an upcoming trip', async () => {
    const trip = (await sa.post('/trips', { routeId: base.route.id, vehicleId: base.vehicle.id, driverId: base.driver.id, departureAt: new Date(Date.now() + 7200_000).toISOString() }).expect(201)).body;
    await cashier.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
    await cashier.post('/bookings', { tripId: trip.id, seatNo: '14', passengerName: 'Rakaab', passengerPhone: '0634111111', payment: { method: 'CASH', currency: 'USD' } }).expect(201);
    const smaller = { rows: [['D', null, '1', '2'], ['3', '4', null, '5'], ['6', '7', null, '8'], ['9', '10', null, '11'], ['12', '13', null, null]], front: ['1', '2'] };
    const r = await sa.patch(`/vehicles/${base.vehicle.id}`, { seatLayout: smaller });
    expect(r.body.error).toMatchObject({ code: 'SEATS_IN_USE', details: { seats: ['14'] } });
    // adding seats is fine
    const bigger = { rows: [...smaller.rows.slice(0, 4), ['12', '13', '14', '15']], front: ['1', '2'] };
    expect((await sa.patch(`/vehicles/${base.vehicle.id}`, { seatLayout: bigger }).expect(200)).body.capacity).toBe(15);
    expect((await sa.patch(`/vehicles/${base.vehicle.id}`, { isActive: false })).body.error.code).toBe('VEHICLE_HAS_TRIPS');
  });
});
