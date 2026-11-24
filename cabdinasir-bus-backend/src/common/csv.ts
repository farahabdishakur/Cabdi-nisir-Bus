/** CSV (Excel): BOM + comma; qiimaha leh comma/quote/newline waa la xiraa "…". Formula injection (=,+,-,@) waa la difaacaa. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '﻿';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n');
}
