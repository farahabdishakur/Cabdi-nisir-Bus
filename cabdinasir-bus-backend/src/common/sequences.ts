import { SequenceKind } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';

const PREFIX: Record<SequenceKind, string> = { TICKET: 'T', PARCEL: 'P', TRACKING: 'CB', CLAIM: 'C' };

/**
 * Lambar taxane ah laan kasta (CLAUDE.md §3.8). Waa in lagu wacaa transaction gudaheed:
 * UPDATE ... RETURNING wuxuu xiraa row-ga, sidaa darteed laba lambar oo isku mid ah ma dhacaan.
 * Tusaale: BOR-T-000123, BOR-P-000045, CB-BOR-000482
 */
export async function nextNumber(tx: Tx, branchId: string, branchCode: string, kind: SequenceKind) {
  await tx.$executeRaw`
    INSERT INTO "sequences" ("branchId", "kind", "nextValue") VALUES (${branchId}, ${kind}::"SequenceKind", 1)
    ON CONFLICT ("branchId", "kind") DO NOTHING`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "sequences" SET "nextValue" = "nextValue" + 1
    WHERE "branchId" = ${branchId} AND "kind" = ${kind}::"SequenceKind"
    RETURNING "nextValue" - 1 AS value`;
  const n = String(rows[0].value).padStart(6, '0');
  return kind === 'TRACKING' ? `${PREFIX[kind]}-${branchCode}-${n}` : `${branchCode}-${PREFIX[kind]}-${n}`;
}
