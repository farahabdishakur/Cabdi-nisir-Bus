-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "edahabNumber" TEXT,
ADD COLUMN     "zaadNumber" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payerPhone" TEXT,
ADD COLUMN     "reconcileNote" TEXT,
ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciledById" TEXT;


-- Hal transaction Zaad/eDahab = hal lacag (macmiil ma isticmaali karo isla SMS-ka laba jeer)
CREATE UNIQUE INDEX "payments_mobile_ref_unique" ON "payments" ("method", "reference")
  WHERE "reference" IS NOT NULL AND "method" <> 'CASH' AND "kind" IN ('TICKET', 'PARCEL', 'TRANSFER_DIFF') AND "amount" > 0;
CREATE INDEX "payments_mobile_reconcile_idx" ON "payments" ("branchId", "method", "reconciledAt");
