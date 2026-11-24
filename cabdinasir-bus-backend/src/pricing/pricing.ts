/**
 * Xisaabinta qiimaha (BUSINESS_RULES §6). MEELNA kale lagama xisaabiyo qiimo.
 * Pure functions — integer kaliya (senti). Natiijadu waxay la socotaa breakdown.
 */

export interface TicketPriceInput {
  ticketPriceCents: number;
  frontSeatSurchargeCents: number;
  isFrontSeat: boolean;
  discountCents: number;
}

export interface ParcelPriceInput {
  baseFeeCents: number;
  /** multiplier × 100 (tusaale 1.5 → 150) si float looga fogaado */
  perKgMultiplierPct: number;
  parcelPerKgCents: number;
  parcelMinFeeCents: number;
  weightKg: number;
  isFragile: boolean;
  fragileSurchargeCents: number;
  insured: boolean;
  declaredValueCents: number;
  insuranceBps: number;
}

export interface PriceLine {
  label: string;
  cents: number;
}

export interface PriceResult {
  totalCents: number;
  lines: PriceLine[];
}

export function ticketPrice(i: TicketPriceInput): PriceResult {
  const lines: PriceLine[] = [{ label: 'route_fare', cents: i.ticketPriceCents }];
  if (i.isFrontSeat && i.frontSeatSurchargeCents > 0) lines.push({ label: 'front_seat', cents: i.frontSeatSurchargeCents });
  const gross = lines.reduce((s, l) => s + l.cents, 0);
  const discount = Math.min(Math.max(0, i.discountCents), gross);
  if (discount > 0) lines.push({ label: 'discount', cents: -discount });
  return { totalCents: gross - discount, lines };
}

export function parcelPrice(i: ParcelPriceInput): PriceResult {
  const kg = Math.ceil(i.weightKg);
  const lines: PriceLine[] = [{ label: 'base_fee', cents: i.baseFeeCents }];
  const weightCents = Math.round((kg * i.parcelPerKgCents * i.perKgMultiplierPct) / 100);
  if (weightCents > 0) lines.push({ label: `weight_${kg}kg`, cents: weightCents });
  if (i.isFragile && i.fragileSurchargeCents > 0) lines.push({ label: 'fragile', cents: i.fragileSurchargeCents });
  if (i.insured && i.declaredValueCents > 0) {
    lines.push({ label: 'insurance', cents: Math.round((i.declaredValueCents * i.insuranceBps) / 10000) });
  }
  let total = lines.reduce((s, l) => s + l.cents, 0);
  if (total < i.parcelMinFeeCents) {
    lines.push({ label: 'minimum_fee_adjustment', cents: i.parcelMinFeeCents - total });
    total = i.parcelMinFeeCents;
  }
  return { totalCents: total, lines };
}

/** USD senti → SLSH (shilin), la soo koobay 100 shilin ee ugu dhow (lacagta gacanta). */
export function usdCentsToSlsh(cents: number, usdToSlsh: number): number {
  return Math.round((cents * usdToSlsh) / 100 / 100) * 100;
}

/** SLSH → USD senti (payment-ka la qaaday SLSH, xisaabta USD). */
export function slshToUsdCents(slsh: number, usdToSlsh: number): number {
  return Math.round((slsh * 100) / usdToSlsh);
}
