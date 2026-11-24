/**
 * Taleefannada Somaliland: 063 4500038 → +252634500038.
 * Kaliya lambarada mobile-ka ayaa SMS qaadan kara (063/065/066/067/068/069 iwm).
 */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('00')) return `+${d.slice(2)}`;
  if (d.startsWith('252')) return `+${d}`;
  if (d.startsWith('0')) return `+252${d.slice(1)}`;
  if (/^6\d{8}$/.test(d)) return `+252${d}`;
  return d;
}

export function isSmsCapable(raw: string): boolean {
  return /^\+2526[0-9]\d{7}$/.test(normalizePhone(raw));
}
