/**
 * QIYAAS OFFLINE oo keliya — waa nuqul ka mid ah backend `src/pricing/pricing.ts` (parcelPrice).
 * Online: qiimaha mar walba backend-ka ayaa xisaabiya (`POST /parcels/quote`) — CLAUDE.md §3.1.
 * Offline: rasiidka waxaa ku qoran "qiyaas"; marka la sync-gareeyo server-ka ayaa go'aamiya.
 * Haddii backend-ka qaacidadiisa la beddelo, halkan sidoo kale beddel.
 */
export interface OfflinePriceInput {
  baseFeeCents: number;
  perKgMultiplier: number;
  parcelPerKgCents: number;
  parcelMinFeeCents: number;
  weightKg: number;
  isFragile: boolean;
  fragileSurchargeCents: number;
  insured: boolean;
  declaredValueCents: number;
  insuranceBps: number;
}

export function estimateParcel(i: OfflinePriceInput): number {
  const kg = Math.ceil(i.weightKg);
  const multPct = Math.round(i.perKgMultiplier * 100);
  let total = i.baseFeeCents + Math.round((kg * i.parcelPerKgCents * multPct) / 100);
  if (i.isFragile) total += i.fragileSurchargeCents;
  if (i.insured && i.declaredValueCents > 0) total += Math.round((i.declaredValueCents * i.insuranceBps) / 10000);
  return Math.max(total, i.parcelMinFeeCents);
}
