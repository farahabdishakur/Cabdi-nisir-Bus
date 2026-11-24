import { toCsv } from './csv';
import { isSmsCapable, normalizePhone } from './phone';
import { assertTransition, PARCEL_TRANSITIONS, TRIP_TRANSITIONS } from './state-machine';
import { businessDate, businessDayRange } from './time';
import { redactPin, render } from '../notifications/templates';
import { parseSeatLayout, HIACE_14 } from '../vehicles/seat-layout';

describe('phone', () => {
  it.each([
    ['063 4500038', '+252634500038'],
    ['0634500038', '+252634500038'],
    ['252634500038', '+252634500038'],
    ['00252634500038', '+252634500038'],
    ['634500038', '+252634500038'],
  ])('%s → %s', (raw, out) => expect(normalizePhone(raw)).toBe(out));
  it('landlines cannot receive SMS', () => {
    expect(isSmsCapable('610700')).toBe(false);
    expect(isSmsCapable('063-4500038')).toBe(true);
  });
});

describe('csv', () => {
  it('quotes, escapes and blocks formula injection', () => {
    const out = toCsv([{ a: 'x,y', b: 'say "hi"', c: '=HYPERLINK()', d: -5 }]);
    expect(out).toBe('﻿a,b,c,d\r\n"x,y","say ""hi""",\'=HYPERLINK(),-5');
  });
});

describe('state machines', () => {
  it('blocks illegal parcel jumps', () => {
    expect(() => assertTransition('Parcel', PARCEL_TRANSITIONS, 'REGISTERED', 'DELIVERED')).toThrow();
    expect(() => assertTransition('Parcel', PARCEL_TRANSITIONS, 'ARRIVED', 'DELIVERED')).not.toThrow();
  });
  it('departed trips cannot be cancelled', () => {
    expect(() => assertTransition('Trip', TRIP_TRANSITIONS, 'DEPARTED', 'CANCELLED')).toThrow();
  });
});

describe('business time (UTC+3)', () => {
  it('22:30 UTC is already the next business day', () => {
    expect(businessDate(new Date('2026-11-24T22:30:00Z'))).toBe('2026-11-25');
  });
  it('day range starts at 21:00 UTC previous day', () => {
    expect(businessDayRange('2026-11-25').start.toISOString()).toBe('2026-11-24T21:00:00.000Z');
  });
});

describe('sms templates', () => {
  it('renders and redacts PIN', () => {
    const body = render('PARCEL_REGISTERED', { sender: 'Xasan', pieces: 2, from: 'Boorama', to: 'Wajaale', code: 'CB-BOR-000001', pin: '1234', cod: '' });
    expect(body).toContain('PIN: 1234');
    expect(redactPin(body)).toContain('PIN: ****');
  });
});

describe('seat layout', () => {
  it('Hiace has 14 sellable seats, driver excluded', () => {
    expect(parseSeatLayout(HIACE_14).seats).toHaveLength(14);
  });
  it('rejects duplicate seats', () => {
    expect(() => parseSeatLayout({ rows: [['1', '1']] })).toThrow();
  });
});
