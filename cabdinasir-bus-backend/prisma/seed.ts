/**
 * Seed: xogta aasaasiga ah ee Cabdinasir Bus.
 * - Laamaha (taleefannada boodhka xafiiska) · Noocyada alaabta · Routes · Super Admin
 * - SEED_DEMO=true → shaqaale tijaabo ah, gaari, darawal, sicir (development kaliya)
 *
 * ⚠️ Qiimayaasha routes-ka waa TUSAALE — Super Admin waa inuu ku beddelaa kuwa dhabta ah.
 * ⚠️ Taleefannada Boorama Laanta 2 — ku dar Admin → Laamaha.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import 'dotenv/config';

const prisma = new PrismaClient();

/** Boorama: 2 laamood (waxay wadaagaan safarada) · Wajaale: 1. Taleefannada: boodhka xafiiska. */
const BRANCHES = [
  { code: 'BO1', name: 'Boorama — Laanta 1', city: 'Boorama', phones: ['610700', '613053', '063-4500038', '063-6111188'] },
  { code: 'BO2', name: 'Boorama — Laanta 2', city: 'Boorama', phones: [] as string[] },
  { code: 'WAJ', name: 'Wajaale', city: 'Wajaale', phones: ['644408', '644945', '634500038', '63 6111144'] },
];

const CATEGORIES = [
  { nameSo: 'Xawaash / Raashin', nameEn: 'Spices / Food', baseFeeCents: 100, perKgMultiplier: 1 },
  { nameSo: 'Kabo', nameEn: 'Shoes', baseFeeCents: 100, perKgMultiplier: 1 },
  { nameSo: 'Dhar', nameEn: 'Clothes', baseFeeCents: 100, perKgMultiplier: 1 },
  { nameSo: 'Elektaroonig', nameEn: 'Electronics', baseFeeCents: 200, perKgMultiplier: 1.5 },
  { nameSo: 'Dukumenti', nameEn: 'Documents', baseFeeCents: 100, perKgMultiplier: 0 },
  { nameSo: 'Qalab guri', nameEn: 'Household items', baseFeeCents: 150, perKgMultiplier: 1 },
  { nameSo: 'Daawo', nameEn: 'Medicine', baseFeeCents: 150, perKgMultiplier: 1 },
  { nameSo: 'Kale', nameEn: 'Other', baseFeeCents: 100, perKgMultiplier: 1 },
  { nameSo: 'Alaab khatar ah (shidaal, kiimiko, hub)', nameEn: 'Dangerous goods', baseFeeCents: 0, perKgMultiplier: 0, isProhibited: true },
];

/** TUSAALE qiimayaal (USD senti) — beddel. */
const ROUTE_PRICES = { ticketPriceCents: 300, frontSeatSurchargeCents: 0, parcelPerKgCents: 30, parcelMinFeeCents: 100 };

async function main() {
  const branches = [];
  for (const b of BRANCHES) {
    branches.push(await prisma.branch.upsert({ where: { code: b.code }, create: b, update: {} }));
  }

  // Routes: kaliya magaalooyin kala duwan (Boorama ⇄ Wajaale) — Boorama 1 ⇄ Boorama 2 ma jiro
  for (const from of branches) {
    for (const to of branches) {
      if (from.city === to.city) continue;
      await prisma.route.upsert({
        where: { fromBranchId_toBranchId: { fromBranchId: from.id, toBranchId: to.id } },
        create: { fromBranchId: from.id, toBranchId: to.id, ...ROUTE_PRICES },
        update: {},
      });
    }
  }

  if ((await prisma.parcelCategory.count()) === 0) {
    await prisma.parcelCategory.createMany({ data: CATEGORIES });
  }

  const phone = process.env.SEED_SUPER_ADMIN_PHONE ?? '0630000000';
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_SUPER_ADMIN_PASSWORD is required');
  await prisma.user.upsert({
    where: { phone },
    create: { name: 'Super Admin', phone, role: Role.SUPER_ADMIN, passwordHash: await argon2.hash(password), mustChangePassword: true },
    update: {},
  });

  if (process.env.SEED_DEMO === 'true') await demo(branches);
  console.log('✔ Seed done');
}

async function demo(branches: { id: string; code: string; city: string }[]) {
  const pw = await argon2.hash('Demo1234');
  const [bo1, bo2, waj] = branches;
  const users = [
    { name: 'Maamulaha Boorama 1', phone: '0631000001', role: Role.BRANCH_MANAGER, branchId: bo1.id },
    { name: 'Karraani Boorama 1', phone: '0631000002', role: Role.CASHIER, branchId: bo1.id },
    { name: 'Maamulaha Boorama 2', phone: '0633000001', role: Role.BRANCH_MANAGER, branchId: bo2.id },
    { name: 'Karraani Boorama 2', phone: '0633000002', role: Role.CASHIER, branchId: bo2.id },
    { name: 'Maamulaha Wajaale', phone: '0632000001', role: Role.BRANCH_MANAGER, branchId: waj.id },
    { name: 'Karraani Wajaale', phone: '0632000002', role: Role.CASHIER, branchId: waj.id },
  ];
  for (const u of users) await prisma.user.upsert({ where: { phone: u.phone }, create: { ...u, passwordHash: pw }, update: {} });

  const layout = {
    rows: [['D', null, '1', '2'], ['3', '4', null, '5'], ['6', '7', null, '8'], ['9', '10', null, '11'], ['12', '13', '14', null]],
    front: ['1', '2'],
  };
  await prisma.vehicle.upsert({ where: { plate: 'SL-DEMO-1' }, create: { plate: 'SL-DEMO-1', model: 'Toyota Hiace', seatLayout: layout, capacity: 14 }, update: {} });
  if ((await prisma.driver.count()) === 0) await prisma.driver.create({ data: { name: 'Darawal Tijaabo', phone: '0635000001' } });
  // Basas 10 qof ah (safka gaadiidka): gaari kasta darawalkiisa caadiga ah
  const bus10 = { rows: [['D', null, null, null, null], ['1', '2', null, '3', '4'], ['5', '6', null, '7', '8'], ['9', '10', null, null, null]], front: [] };
  const names = ['Cali Xasan', 'Maxamed Yuusuf', 'Cabdi Faarax', 'Axmed Jaamac'];
  for (let i = 0; i < names.length; i++) {
    const phone = `063510000${i + 1}`;
    const drv = (await prisma.driver.findFirst({ where: { phone } })) ?? (await prisma.driver.create({ data: { name: names[i], phone, branchId: bo1.id } }));
    await prisma.vehicle.upsert({ where: { plate: `BUS-${i + 1}` }, create: { plate: `BUS-${i + 1}`, model: 'Bas 10 qof', seatLayout: bus10, capacity: 10, defaultDriverId: drv.id }, update: {} });
  }
  const sa = await prisma.user.findFirstOrThrow({ where: { role: Role.SUPER_ADMIN } });
  const today = new Date(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10));
  await prisma.exchangeRate.upsert({ where: { date: today }, create: { date: today, usdToSlsh: 8500, setById: sa.id }, update: {} });
  console.log('✔ Demo data (password: Demo1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
