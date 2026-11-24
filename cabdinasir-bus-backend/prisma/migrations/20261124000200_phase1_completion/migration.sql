-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'DRIVER_ALLOWANCE', 'MAINTENANCE', 'RENT', 'UTILITIES', 'SALARY', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositTarget" AS ENUM ('HEAD_OFFICE', 'BANK', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VoidEntity" AS ENUM ('BOOKING', 'PARCEL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentKind" ADD VALUE 'EXPENSE';
ALTER TYPE "PaymentKind" ADD VALUE 'DEPOSIT';
ALTER TYPE "PaymentKind" ADD VALUE 'TRANSFER_DIFF';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transferredFromTripId" TEXT;

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "offlineCreatedAt" TIMESTAMP(3),
ADD COLUMN     "printCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remindersSent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "tripId" TEXT,
    "paymentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "target" "DepositTarget" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paymentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "void_requests" (
    "id" TEXT NOT NULL,
    "entity" "VoidEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refund" BOOLEAN NOT NULL DEFAULT true,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "void_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "parcelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_paymentId_key" ON "expenses"("paymentId");

-- CreateIndex
CREATE INDEX "expenses_branchId_createdAt_idx" ON "expenses"("branchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_paymentId_key" ON "deposits"("paymentId");

-- CreateIndex
CREATE INDEX "deposits_branchId_createdAt_idx" ON "deposits"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "void_requests_branchId_status_idx" ON "void_requests"("branchId", "status");

-- CreateIndex
CREATE INDEX "void_requests_entity_entityId_idx" ON "void_requests"("entity", "entityId");

-- CreateIndex
CREATE INDEX "notifications_status_sendAfter_idx" ON "notifications"("status", "sendAfter");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

