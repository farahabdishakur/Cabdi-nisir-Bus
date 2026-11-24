/** $4.60 — fariimaha SMS iyo CSV. */
export const formatUsd = (cents: number) => '$' + (cents / 100).toFixed(2);
