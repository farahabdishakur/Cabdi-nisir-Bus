/**
 * Muujinta lacagta & waqtiga — meel keliya (CLAUDE.md §3.3).
 * Waqtiga: Africa/Mogadishu (UTC+3). Lacagta: integer (senti / shilin) → qoraal.
 */
const TZ = 'Africa/Mogadishu';

export function usd(cents: number | null | undefined): string {
  const c = cents ?? 0;
  const sign = c < 0 ? '-' : '';
  return `${sign}$${(Math.abs(c) / 100).toFixed(2)}`;
}

export function slsh(amount: number | null | undefined): string {
  return `${(amount ?? 0).toLocaleString('en-US')} SLSH`;
}

export function money(amount: number, currency: 'USD' | 'SLSH'): string {
  return currency === 'USD' ? usd(amount) : slsh(amount);
}

/** Dollar qoraal ("4.60") → senti (460). Float lagama dhigo xisaab — kaliya gelinta. */
export function parseUsd(input: string): number | null {
  const s = input.trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function parseInteger(input: string): number | null {
  const s = input.trim().replace(/[,\s]/g, '');
  return /^\d+$/.test(s) ? Number(s) : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });

export function dateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return dtf({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(',', '');
}

export function time(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function date(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return dtf({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
}

/** Maanta (YYYY-MM-DD) waqtiga ganacsiga */
export function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + 3 * 3600_000 + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-25" + "14:30" (waqtiga Somaliland) → ISO UTC */
export function localToIso(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00+03:00`).toISOString();
}

export function phone(p: string | null | undefined): string {
  if (!p) return '—';
  const d = p.replace(/\s/g, '');
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}
