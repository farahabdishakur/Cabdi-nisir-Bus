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
}

export const DEFAULT_SETTINGS: PricingSettings = {
  fragileSurchargeCents: 100,
  insuranceBps: 200,
  maxDiscountBps: 1000,
  seatHoldSeconds: 180,
  uncollectedDays: 7,
  storageFeePerDayCents: 50,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(db: Tx | PrismaService = this.prisma): Promise<PricingSettings> {
    const rows = await db.pricingSetting.findMany();
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
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
