-- CreateEnum
CREATE TYPE "DriverPayType" AS ENUM ('PER_TRIP', 'PERCENT_TICKETS', 'PERCENT_TRIP_INCOME', 'MONTHLY_SALARY');

-- CreateEnum
CREATE TYPE "DriverEarningKind" AS ENUM ('TRIP', 'SALARY', 'BONUS');

-- CreateEnum
CREATE TYPE "DriverPaymentKind" AS ENUM ('ADVANCE', 'PAYOUT', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "LedgerBook" AS ENUM ('BRANCH', 'HEAD_OFFICE');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT');

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'DRIVER_PAY';

-- DropIndex
DROP INDEX "payments_mobile_reconcile_idx";

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "attachmentUrl" TEXT;

-- CreateTable
CREATE TABLE "driver_pay_rules" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "DriverPayType" NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "bps" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_pay_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_earnings" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "DriverEarningKind" NOT NULL,
    "tripId" TEXT,
    "period" TEXT,
    "amountCents" INTEGER NOT NULL,
    "basis" JSONB NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_payments" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "kind" "DriverPaymentKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentId" TEXT,
    "ledgerEntryId" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "book" "LedgerBook" NOT NULL,
    "branchId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountUsdCents" INTEGER NOT NULL,
    "exchangeRate" INTEGER,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachmentUrl" TEXT,
    "idempotencyKey" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_pay_rules_driverId_effectiveFrom_idx" ON "driver_pay_rules"("driverId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "driver_earnings_driverId_createdAt_idx" ON "driver_earnings"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_earnings_driverId_tripId_key" ON "driver_earnings"("driverId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_earnings_driverId_period_key" ON "driver_earnings"("driverId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payments_paymentId_key" ON "driver_payments"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payments_ledgerEntryId_key" ON "driver_payments"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_payments_idempotencyKey_key" ON "driver_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "driver_payments_driverId_createdAt_idx" ON "driver_payments"("driverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key" ON "ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_entries_book_branchId_entryDate_idx" ON "ledger_entries"("book", "branchId", "entryDate");

-- AddForeignKey
ALTER TABLE "driver_pay_rules" ADD CONSTRAINT "driver_pay_rules_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_payments" ADD CONSTRAINT "driver_payments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Xisaabaadka lama tirtiro (void kaliya)
CREATE TRIGGER driver_earnings_no_delete BEFORE DELETE ON "driver_earnings" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER driver_payments_no_delete BEFORE DELETE ON "driver_payments" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
