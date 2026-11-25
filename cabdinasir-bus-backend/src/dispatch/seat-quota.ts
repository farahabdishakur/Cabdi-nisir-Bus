/**
 * Qoondada kuraasta (offline): laamaha isku magaalada ah (Boorama 1 & 2) gaari kasta kuraastiisa way u qaybsadaan —
 * laan kasta kuraas gooni ah (isku xiga), si internet la'aan labada laamood aysan isku kursi u iibin.
 * Laan keli ah (Wajaale) → kuraasta oo dhan. Kala horreynta laamaha: koodhka (BO1, BO2 …).
 */
export function seatQuota(seats: string[], branchIds: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!branchIds.length) return out;
  const size = Math.ceil(seats.length / branchIds.length);
  branchIds.forEach((b, i) => (out[b] = seats.slice(i * size, (i + 1) * size)));
  return out;
}
