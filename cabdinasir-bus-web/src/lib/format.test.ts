import { describe, expect, it } from 'vitest';
import { localToIso, parseInteger, parseUsd, phone, slsh, todayISO, usd } from './format';

describe('money', () => {
  it('formats cents', () => {
    expect(usd(460)).toBe('$4.60');
    expect(usd(-50)).toBe('-$0.50');
    expect(usd(0)).toBe('$0.00');
    expect(slsh(25500)).toBe('25,500 SLSH');
  });
  it('parses dollar input to integer cents without float errors', () => {
    expect(parseUsd('4.6')).toBe(460);
    expect(parseUsd('$1,234.56')).toBe(123456);
    expect(parseUsd('0.29')).toBe(29);
    expect(parseUsd('19.99')).toBe(1999);
    expect(parseUsd('abc')).toBeNull();
    expect(parseUsd('1.234')).toBeNull();
  });
  it('parses integers', () => {
    expect(parseInteger('25,500')).toBe(25500);
    expect(parseInteger('-1')).toBeNull();
  });
});

describe('time (Africa/Mogadishu)', () => {
  it('local date+time → UTC ISO', () => {
    expect(localToIso('2026-11-25', '07:00')).toBe('2026-11-25T04:00:00.000Z');
  });
  it('today is a YYYY-MM-DD string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('phone', () => {
  it('groups Somaliland numbers', () => {
    expect(phone('0634500038')).toBe('063 4500038');
    expect(phone('610700')).toBe('610700');
  });
});
