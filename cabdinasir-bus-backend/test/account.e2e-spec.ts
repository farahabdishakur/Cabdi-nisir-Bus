import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { api, createApp, login, PW, resetDb, seedBase } from './helpers';

/** Akoonkayga: password + taleefanka login-ka beddel (password-ka hadda waajib) · maamuluhu taleefanka karraaniga wuu beddeli karaa */
describe('My account: change password and login phone (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  const post = (path: string, token: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send(body);
  const tryLogin = (phone: string, password: string) => request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone, password });

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('change phone: wrong password refused, taken number refused, then login with the new number', async () => {
    const token = await login(app, '0612');
    expect((await post('/auth/change-phone', token, { currentPassword: 'wrong', newPhone: '0634777777' })).body.error.code).toBe('WRONG_PASSWORD');
    expect((await post('/auth/change-phone', token, { currentPassword: PW, newPhone: '0611' })).body.error.code).toBe('PHONE_USED');
    const r = await post('/auth/change-phone', token, { currentPassword: PW, newPhone: '063 477 7777' }).expect(200);
    expect(r.body.accessToken).toBeTruthy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: base.users.borCashier.id } })).phone).toBe('0634777777');
    expect((await tryLogin('0612', PW)).status).not.toBe(200);
    expect((await tryLogin('0634777777', PW)).status).toBe(200);
    // token-kii hore wuu dhacay (qalabka kale waa laga saaray)
    expect((await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('change password from inside (voluntary) → old password stops working', async () => {
    const token = await login(app, '0622');
    await post('/auth/change-password', token, { currentPassword: PW, newPassword: 'Cusub2026x' }).expect(200);
    expect((await tryLogin('0622', PW)).status).not.toBe(200);
    expect((await tryLogin('0622', 'Cusub2026x')).status).toBe(200);
  });

  it('manager changes a cashier login phone; duplicate refused', async () => {
    const mgr = api(app, await login(app, '0611'));
    const cashier = await prisma.user.findUniqueOrThrow({ where: { phone: '0634777777' } });
    expect((await mgr.patch(`/users/${cashier.id}`, { phone: '0621' })).body.error.code).toBe('PHONE_USED');
    await mgr.patch(`/users/${cashier.id}`, { phone: '0634888888' }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: cashier.id } })).phone).toBe('0634888888');
    expect(base.users.borCashier.id).toBe(cashier.id);
  });
});
