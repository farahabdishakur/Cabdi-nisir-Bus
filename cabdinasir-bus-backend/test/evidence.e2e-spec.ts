import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import request from 'supertest';
import { api, createApp, login, PW, resetDb, seedBase } from './helpers';

/**
 * Caddaynta alaabta (sawir/video marxalad kasta, sha256, lama tirtiro) + cabashooyinka macmiilka
 * (fur → caddaynta → go'aan maamule) + sawir waajib marka la dhiibayo (dejin).
 */
describe('Parcel evidence & claims (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  let base: Awaited<ReturnType<typeof seedBase>>;
  let sa: ReturnType<typeof api>;
  let cashier: ReturnType<typeof api>;
  let wajCashier: ReturnType<typeof api>;
  let wajManager: ReturnType<typeof api>;
  let outsider: ReturnType<typeof api>;
  let parcel: { id: string; trackingCode: string; pickupPin: string };
  let claimId: string;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d80000000049454e44ae426082', 'hex');
  const mp4 = Buffer.concat([Buffer.from('0000001c6674797069736f6d0000020069736f6d69736f32', 'hex'), Buffer.alloc(64, 1)]);

  const upload = async (phone: string, parcelId: string, file: Buffer, type: string, fields: Record<string, string> = {}) => {
    const tok = await login(app, phone);
    let r = request(app.getHttpServer()).post(`/api/v1/parcels/${parcelId}/media`).set('Authorization', `Bearer ${tok}`);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
    return r.attach('file', file, { filename: 'f', contentType: type });
  };

  beforeAll(async () => {
    await resetDb(prisma);
    base = await seedBase(prisma);
    app = await createApp();
    sa = api(app, await login(app, '0600'));
    cashier = api(app, await login(app, '0612'));
    wajCashier = api(app, await login(app, '0622'));
    wajManager = api(app, await login(app, '0621'));
    const hgs = await prisma.branch.create({ data: { code: 'HGS', name: 'Hargeysa', city: 'Hargeysa' } });
    await prisma.user.create({ data: { phone: '0631', role: Role.CASHIER, branchId: hgs.id, name: 'Outsider', passwordHash: await argon2.hash(PW) } });
    outsider = api(app, await login(app, '0631'));
    await cashier.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
    await wajCashier.post('/cash-sessions/open', { openingUsdCents: 0 }).expect(201);
    const p = await cashier.post('/parcels', {
      toBranchId: base.waj.id, categoryId: base.shoes.id, weightKg: 5, pieces: 1, senderName: 'Diraha', senderPhone: '0634555555',
      receiverName: 'Qaataha', receiverPhone: '0634666666', payer: 'SENDER', isFragile: true, payment: { method: 'CASH', currency: 'USD' },
    }).expect(201);
    parcel = p.body;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('photo at registration: stage from status, sha256 stored, file served to both branches only', async () => {
    const r = await upload('0612', parcel.id, png, 'image/png', { note: 'Kartoon xiran' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ stage: 'REGISTER', kind: 'PHOTO', sha256: createHash('sha256').update(png).digest('hex'), note: 'Kartoon xiran' });
    const f = await request(app.getHttpServer()).get(`/api/v1/media/${r.body.id}`).set('Authorization', `Bearer ${await login(app, '0622')}`).expect(200);
    expect(f.headers['content-type']).toContain('image/png');
    expect((await outsider.get(`/media/${r.body.id}`)).body.error.code).toBe('FORBIDDEN_BRANCH');
    expect((await outsider.get(`/parcels/${parcel.id}/media`)).body.error.code).toBe('FORBIDDEN_BRANCH');
  });

  it('rejects a file whose content does not match its type; accepts video', async () => {
    const fake = await upload('0612', parcel.id, Buffer.from('not really a jpeg'), 'image/jpeg');
    expect(fake.body.error.code).toBe('INVALID_FILE_TYPE');
    const exe = await upload('0612', parcel.id, Buffer.from('MZ....'), 'application/octet-stream');
    expect(exe.body.error.code).toBe('INVALID_FILE_TYPE');
    const v = await upload('0612', parcel.id, mp4, 'video/mp4', { stage: 'LOAD' });
    expect(v.status).toBe(201);
    expect(v.body).toMatchObject({ kind: 'VIDEO', stage: 'LOAD' });
    const list = await wajCashier.get(`/parcels/${parcel.id}/media`).expect(200);
    expect(list.body.map((m: { stage: string }) => m.stage)).toEqual(['REGISTER', 'LOAD']);
    expect(list.body[0]).toMatchObject({ takenBy: '0612', branchCode: 'BOR' });
  });

  it('evidence is append-only in the database (no delete, no edit)', async () => {
    const m = await prisma.parcelMedia.findFirstOrThrow();
    await expect(prisma.parcelMedia.delete({ where: { id: m.id } })).rejects.toThrow();
    await expect(prisma.parcelMedia.update({ where: { id: m.id }, data: { note: 'beddel' } })).rejects.toThrow();
  });

  it('setting: no handover without a delivery photo', async () => {
    await prisma.parcel.update({ where: { id: parcel.id }, data: { status: 'ARRIVED', arrivedAt: new Date() } });
    await sa.put('/pricing-settings', { requireDeliveryPhoto: 1 }).expect(200);
    const blocked = await wajCashier.post(`/parcels/${parcel.id}/deliver`, { pin: parcel.pickupPin, receivedByName: 'Qaataha' });
    expect(blocked.body.error.code).toBe('DELIVERY_PHOTO_REQUIRED');
    const d = await upload('0622', parcel.id, png, 'image/png', { stage: 'DELIVER', note: 'Qaataha oo haysta' });
    expect(d.status).toBe(201);
    await wajCashier.post(`/parcels/${parcel.id}/deliver`, { pin: parcel.pickupPin, receivedByName: 'Qaataha' }).expect(201);
    await sa.put('/pricing-settings', { requireDeliveryPhoto: 0 }).expect(200);
  });

  it('claim: opened once, evidence file with checks, SMS to the customer', async () => {
    const c = await wajCashier.post(`/parcels/${parcel.id}/claims`, { type: 'DAMAGED', description: 'Kabaha way jabeen', claimantName: 'Qaataha', claimantPhone: '0634666666', claimedAmountCents: 2000 }).expect(201);
    expect(c.body).toMatchObject({ claimNo: 'WAJ-C-000001', status: 'OPEN' });
    claimId = c.body.id;
    const again = await cashier.post(`/parcels/${parcel.id}/claims`, { type: 'MISSING', description: 'Mid kale', claimantName: 'Diraha', claimantPhone: '0634666666' });
    expect(again.body.error.code).toBe('CLAIM_ALREADY_OPEN');
    const claimPhoto = await upload('0622', parcel.id, png, 'image/png', { claimId, stage: 'REGISTER' });
    expect(claimPhoto.body.stage).toBe('CLAIM');

    const file = await wajManager.get(`/claims/${claimId}`).expect(200);
    expect(file.body.checks).toMatchObject({ registerMedia: true, loadMedia: true, deliverMedia: true, deliveredWithPin: true, deliveredToName: 'Qaataha', fragileDeclared: true });
    expect(file.body.media).toHaveLength(4);
    expect(file.body.parcel.pickupPinHash).toBeUndefined();
    expect((await outsider.get(`/claims/${claimId}`)).body.error.code).toBe('NOT_FOUND');
    const sms = await prisma.notification.findMany({ where: { template: 'CLAIM_OPENED' } });
    expect(sms[0].body).toContain('WAJ-C-000001');
  });

  it('claim: only managers decide; no compensation on reject; decided once', async () => {
    expect((await wajCashier.post(`/claims/${claimId}/resolve`, { decision: 'REJECTED', resolution: 'Sawirka dhiibista waa caafimaad' })).status).toBe(403);
    const bad = await wajManager.post(`/claims/${claimId}/resolve`, { decision: 'REJECTED', resolution: 'Sawirka dhiibista', compensationCents: 500 });
    expect(bad.body.error.code).toBe('NO_COMPENSATION_ON_REJECT');
    const ok = await wajManager.post(`/claims/${claimId}/resolve`, { decision: 'REJECTED', resolution: 'Sawirka dhiibista: alaabtu waa caafimaad' }).expect(201);
    expect(ok.body.status).toBe('REJECTED');
    const twice = await wajManager.post(`/claims/${claimId}/resolve`, { decision: 'ACCEPTED', resolution: 'beddel go\'aan' });
    expect(twice.body.error.code).toBe('CLAIM_NOT_OPEN');
    const sms = await prisma.notification.findFirstOrThrow({ where: { template: 'CLAIM_RESOLVED' } });
    expect(sms.body).toContain('waa la diiday');
    const open = await wajManager.get('/claims?status=OPEN').expect(200);
    expect(open.body.meta.total).toBe(0);
    expect((await cashier.get(`/claims?parcelId=${parcel.id}`).expect(200)).body.meta.total).toBe(1);
    const all = await cashier.get('/claims').expect(200);
    expect(all.body.data[0]).toMatchObject({ claimNo: 'WAJ-C-000001', parcel: { trackingCode: parcel.trackingCode } });
    // cabasho cusub waa la furi karaa marka tii hore la xiro
    await cashier.post(`/parcels/${parcel.id}/claims`, { type: 'INCOMPLETE', description: 'Hal kabo ayaa ka maqan', claimantName: 'Diraha', claimantPhone: '0634555555' }).expect(201);
  });
});
