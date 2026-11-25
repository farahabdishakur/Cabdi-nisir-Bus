import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { HIACE_14 } from '../src/vehicles/seat-layout';

export const PW = 'Test1234!';

export async function createApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication({ bodyParser: false });
  setupApp(app);
  await app.init();
  return app;
}

/** Nadiifi database-ka tijaabada (triggers-ka no-delete waa la dami karaa TRUNCATE ayaa ka gudba). */
export async function resetDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

export async function seedBase(prisma: PrismaClient) {
  const hash = await argon2.hash(PW);
  const bor = await prisma.branch.create({ data: { code: 'BOR', name: 'Boorama', city: 'Boorama' } });
  const waj = await prisma.branch.create({ data: { code: 'WAJ', name: 'Wajaale', city: 'Wajaale' } });
  const mk = (phone: string, role: Role, branchId: string | null, name = phone) =>
    prisma.user.create({ data: { phone, role, branchId, name, passwordHash: hash } });
  const users = {
    sa: await mk('0600', Role.SUPER_ADMIN, null, 'Super'),
    borManager: await mk('0611', Role.BRANCH_MANAGER, bor.id),
    borCashier: await mk('0612', Role.CASHIER, bor.id),
    wajManager: await mk('0621', Role.BRANCH_MANAGER, waj.id),
    wajCashier: await mk('0622', Role.CASHIER, waj.id),
  };
  const route = await prisma.route.create({
    data: { fromBranchId: bor.id, toBranchId: waj.id, ticketPriceCents: 300, frontSeatSurchargeCents: 50, parcelPerKgCents: 30, parcelMinFeeCents: 100 },
  });
  await prisma.route.create({ data: { fromBranchId: waj.id, toBranchId: bor.id, ticketPriceCents: 300, parcelPerKgCents: 30 } });
  const vehicle = await prisma.vehicle.create({ data: { plate: 'SL-1', model: 'Hiace', seatLayout: HIACE_14 as object, capacity: 14 } });
  const driver = await prisma.driver.create({ data: { name: 'Cali', phone: '0633' } });
  const shoes = await prisma.parcelCategory.create({ data: { nameSo: 'Kabo', nameEn: 'Shoes', baseFeeCents: 100 } });
  const banned = await prisma.parcelCategory.create({ data: { nameSo: 'Shidaal', nameEn: 'Fuel', baseFeeCents: 0, isProhibited: true } });
  // tests-ka hore: printer (lambar warqad looma baahna); paper-ticket.e2e-spec ayaa tijaabiya ticketMode = 1
  await prisma.pricingSetting.create({ data: { key: 'ticketMode', value: 0 } });
  return { bor, waj, users, route, vehicle, driver, shoes, banned };
}

export async function login(app: INestApplication, phone: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone, password: PW }).expect(200);
  return res.body.accessToken;
}

export function api(app: INestApplication, token: string) {
  const s = app.getHttpServer();
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  return {
    get: (u: string) => auth(request(s).get(`/api/v1${u}`)),
    post: (u: string, body?: object) => auth(request(s).post(`/api/v1${u}`)).send(body ?? {}),
    patch: (u: string, body?: object) => auth(request(s).patch(`/api/v1${u}`)).send(body ?? {}),
    put: (u: string, body?: object) => auth(request(s).put(`/api/v1${u}`)).send(body ?? {}),
    del: (u: string) => auth(request(s).delete(`/api/v1${u}`)),
  };
}
