-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "arrivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "fleetNo" TEXT;

-- CreateTable
CREATE TABLE "vehicle_fines" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT,
    "driverPaymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "vehicle_fines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_fines_driverPaymentId_key" ON "vehicle_fines"("driverPaymentId");

-- CreateIndex
CREATE INDEX "vehicle_fines_vehicleId_createdAt_idx" ON "vehicle_fines"("vehicleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_fleetNo_key" ON "vehicles"("fleetNo");

-- AddForeignKey
ALTER TABLE "vehicle_fines" ADD CONSTRAINT "vehicle_fines_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fines" ADD CONSTRAINT "vehicle_fines_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ganaaxyada lama tirtiro (void + sabab)
CREATE TRIGGER vehicle_fines_no_delete BEFORE DELETE ON "vehicle_fines" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
