import { parcelPrice, slshToUsdCents, ticketPrice, usdCentsToSlsh } from './pricing';

const baseParcel = {
  baseFeeCents: 100,
  perKgMultiplierPct: 100,
  parcelPerKgCents: 30,
  parcelMinFeeCents: 0,
  weightKg: 12,
  isFragile: false,
  fragileSurchargeCents: 100,
  insured: false,
  declaredValueCents: 0,
  insuranceBps: 200,
};

describe('ticketPrice', () => {
  it('route fare only', () => {
    expect(ticketPrice({ ticketPriceCents: 300, frontSeatSurchargeCents: 50, isFrontSeat: false, discountCents: 0 }))
      .toEqual({ totalCents: 300, lines: [{ label: 'route_fare', cents: 300 }] });
  });
  it('front seat + discount', () => {
    const r = ticketPrice({ ticketPriceCents: 300, frontSeatSurchargeCents: 50, isFrontSeat: true, discountCents: 30 });
    expect(r.totalCents).toBe(320);
    expect(r.lines.map((l) => l.label)).toEqual(['route_fare', 'front_seat', 'discount']);
  });
  it('discount never makes price negative', () => {
    expect(ticketPrice({ ticketPriceCents: 300, frontSeatSurchargeCents: 0, isFrontSeat: false, discountCents: 999 }).totalCents).toBe(0);
  });
});

describe('parcelPrice', () => {
  it('matches design doc example: shoes 12kg → $4.60', () => {
    expect(parcelPrice(baseParcel).totalCents).toBe(460);
  });
  it('rounds weight up to whole kg', () => {
    expect(parcelPrice({ ...baseParcel, weightKg: 2.1 }).totalCents).toBe(100 + 3 * 30);
  });
  it('applies category multiplier', () => {
    expect(parcelPrice({ ...baseParcel, perKgMultiplierPct: 150 }).totalCents).toBe(100 + 540);
  });
  it('adds fragile and insurance', () => {
    const r = parcelPrice({ ...baseParcel, isFragile: true, insured: true, declaredValueCents: 50000 });
    expect(r.totalCents).toBe(460 + 100 + 1000);
  });
  it('enforces minimum fee', () => {
    const r = parcelPrice({ ...baseParcel, weightKg: 0.5, baseFeeCents: 0, parcelMinFeeCents: 200 });
    expect(r.totalCents).toBe(200);
    expect(r.lines.at(-1)?.label).toBe('minimum_fee_adjustment');
  });
});

describe('currency', () => {
  it('converts USD cents to SLSH rounded to 100', () => {
    expect(usdCentsToSlsh(460, 8500)).toBe(39100);
  });
  it('converts SLSH to USD cents', () => {
    expect(slshToUsdCents(39100, 8500)).toBe(460);
  });
});
