-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('WAITING', 'LOADING', 'DEPARTED', 'REMOVED');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "defaultDriverId" TEXT;

-- CreateTable
CREATE TABLE "dispatch_entries" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'WAITING',
    "tripId" TEXT,
    "note" TEXT,
    "addedById" TEXT NOT NULL,
    "removedReason" TEXT,
    "loadingAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_entries_tripId_key" ON "dispatch_entries"("tripId");

-- CreateIndex
CREATE INDEX "dispatch_entries_routeId_serviceDate_status_idx" ON "dispatch_entries"("routeId", "serviceDate", "status");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_entries" ADD CONSTRAINT "dispatch_entries_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_entries" ADD CONSTRAINT "dispatch_entries_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_entries" ADD CONSTRAINT "dispatch_entries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hal gaari hal saf oo furan (WAITING/LOADING) waqti kasta — laba saf isku mar ma gelin karo
CREATE UNIQUE INDEX "dispatch_entries_vehicle_open" ON "dispatch_entries"("vehicleId") WHERE "status" IN ('WAITING', 'LOADING');
-- Darawal hal saf oo furan
CREATE UNIQUE INDEX "dispatch_entries_driver_open" ON "dispatch_entries"("driverId") WHERE "status" IN ('WAITING', 'LOADING');
