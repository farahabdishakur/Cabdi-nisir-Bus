-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'RESERVED';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "reservedById" TEXT,
ADD COLUMN     "reservedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "bookings_status_reservedUntil_idx" ON "bookings"("status", "reservedUntil");

