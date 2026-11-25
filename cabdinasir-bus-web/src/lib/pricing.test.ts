import { describe, expect, it } from 'vitest';
import { estimateParcel } from './pricing';

// Waa inay la mid noqdaan backend `src/pricing/pricing.spec.ts`
const base = { baseFeeCents: 100, perKgMultiplier: 1, parcelPerKgCents: 30, parcelMinFeeCents: 0, weightKg: 12, isFragile: false, fragileSurchargeCents: 100, insured: false, declaredValueCents: 0, insuranceBps: 200 };

describe('offline parcel estimate (mirror of backend)', () => {
  it('shoes 12kg → $4.60', () => expect(estimateParcel(base)).toBe(460));
  it('rounds weight up', () => expect(estimateParcel({ ...base, weightKg: 2.1 })).toBe(190));
  it('multiplier', () => expect(estimateParcel({ ...base, perKgMultiplier: 1.5 })).toBe(640));
  it('fragile + insurance', () => expect(estimateParcel({ ...base, isFragile: true, insured: true, declaredValueCents: 50000 })).toBe(1560));
  it('minimum fee', () => expect(estimateParcel({ ...base, weightKg: 0.5, baseFeeCents: 0, parcelMinFeeCents: 200 })).toBe(200));
});
