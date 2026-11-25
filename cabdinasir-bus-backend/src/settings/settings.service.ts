import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { businessDate } from '../common/time';
import { Errors } from '../common/errors';

/** Dejinta qiimaha (Super Admin). Boqolleyda waxaa lagu kaydiyaa basis points (1% = 100) — float la'aan. */
export interface PricingSettings {
  fragileSurchargeCents: number;
  insuranceBps: number;
  maxDiscountBps: number;
  seatHoldSeconds: number;
  uncollectedDays: number;
  storageFeePerDayCents: number;
  /** 1 = laamaha isku magaalada ah (Boorama 1 & 2) waxay wadaagaan safarada; 0 = laan kasta gooni */
  shareTripsWithinCity: number;
  /** Ballan taleefan: kursiga waa la hayaa ilaa N daqiiqo ka hor bixitaanka (0 = ballan lama oggola) */
  reservationCutoffMinutes: number;
  /** Ballamo ugu badan hal taleefan hal safar */
  maxReservationsPerPhone: number;
  /** 1 = alaabta lama dhiibi karo ilaa sawir (marxaladda DELIVER) laga qaado — caddayn ka dhan ah cabasho been ah */
  requireDeliveryPhoto: number;
}

export const DEFAULT_SETTINGS: PricingSettings = {
  fragileSurchargeCents: 100,
  insuranceBps: 200,
  maxDiscountBps: 1000,
  seatHoldSeconds: 180,
  uncollectedDays: 7,
  storageFeePerDayCents: 50,
  shareTripsWithinCity: 1,
  reservationCutoffMinutes: 60,
  maxReservationsPerPhone: 4,
  requireDeliveryPhoto: 0,
};

/** Macluumaadka shirkadda ee rasiidka/label-ka ka muuqda (boodhka xafiiska). */
export interface CompanyProfile {
  name: string;
  tagline: string;
  mission: string;
  slogans: string[];
  passengerRules: string[];
  parcelRules: string[];
  receiptFooter: string;
}

export const DEFAULT_COMPANY: CompanyProfile = {
  name: 'Cabdinasir Bus',
  tagline: 'Transportation & Logistics',
  mission:
    'Ujeeddadeennu waa inaan ku gaadhsiino dadka iyo alaabada meesha ay ku socdaan si ammaan ah, degdeg ah oo laguna kalsoonaan karo.',
  slogans: ['Macmiil kalsoonidaadu waa mudnaantayada', 'Badbaadadaaduna waa masuuliyadayada'],
  passengerRules: ['Ilaalinta waqtiga safarka.', 'Bixinta lacagta safarka.', 'Ixtiraamka shaqaalaha iyo rakaabka kale.'],
  parcelRules: [
    'Alaabta si wanaagsan ha loo xirxiro.',
    'Magaca iyo lambarka qofka leh ha ku qornaadaan.',
    'Lacagta rarista ha la bixiyo.',
    'Alaabaha khatarta ah lama oggola.',
    "Shirkaddu mas'uul kama aha alaab aan si sax ah loo diiwaangelin.",
  ],
  receiptFooter: 'Mahadsanid — Cabdinasir Bus',
};

const COMPANY_KEY = 'company';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(db: Tx | PrismaService = this.prisma): Promise<PricingSettings> {
    const rows = await db.pricingSetting.findMany();
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key === COMPANY_KEY) continue;
      if (r.key in out && typeof r.value === 'number') (out as Record<string, number>)[r.key] = r.value;
    }
    return out;
  }

  async update(patch: Partial<PricingSettings>) {
    await this.prisma.$transaction(
      Object.entries(patch)
        .filter(([k, v]) => k in DEFAULT_SETTINGS && v !== undefined)
        .map(([key, value]) =>
          this.prisma.pricingSetting.upsert({ where: { key }, create: { key, value: value as number }, update: { value: value as number } }),
        ),
    );
    return this.get();
  }

  async company(db: Tx | PrismaService = this.prisma): Promise<CompanyProfile> {
    const row = await db.pricingSetting.findUnique({ where: { key: COMPANY_KEY } });
    return { ...DEFAULT_COMPANY, ...((row?.value as Partial<CompanyProfile> | null) ?? {}) };
  }

  async updateCompany(patch: Partial<CompanyProfile>) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const value = { ...(await this.company()), ...clean };
    await this.prisma.pricingSetting.upsert({
      where: { key: COMPANY_KEY },
      create: { key: COMPANY_KEY, value: value as object },
      update: { value: value as object },
    });
    return value;
  }

  /** Sicirka maanta (1 USD = ? SLSH). Haddii maanta la dejin, kii ugu dambeeyay ayaa la isticmaalaa. */
  async currentRate(db: Tx | PrismaService = this.prisma) {
    const today = new Date(`${businessDate()}T00:00:00.000Z`);
    return db.exchangeRate.findFirst({ where: { date: { lte: today } }, orderBy: { date: 'desc' } });
  }

  async requireRate(db: Tx | PrismaService = this.prisma): Promise<number> {
    const r = await this.currentRate(db);
    if (!r) throw Errors.bad('NO_EXCHANGE_RATE', 'Exchange rate has not been set');
    return r.usdToSlsh;
  }

  setTodayRate(usdToSlsh: number, userId: string) {
    const date = new Date(`${businessDate()}T00:00:00.000Z`);
    return this.prisma.exchangeRate.upsert({
      where: { date },
      create: { date, usdToSlsh, setById: userId },
      update: { usdToSlsh, setById: userId },
    });
  }
}
