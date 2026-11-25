-- CreateEnum
CREATE TYPE "MediaStage" AS ENUM ('REGISTER', 'LOAD', 'ARRIVE', 'DELIVER', 'DAMAGE', 'CLAIM', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('DAMAGED', 'MISSING', 'WRONG_ITEM', 'INCOMPLETE', 'LATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "parcel_media" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "stage" "MediaStage" NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "note" TEXT,
    "branchId" TEXT,
    "takenById" TEXT NOT NULL,
    "claimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_claims" (
    "id" TEXT NOT NULL,
    "claimNo" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "type" "ClaimType" NOT NULL,
    "description" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "claimantPhone" TEXT NOT NULL,
    "claimedAmountCents" INTEGER,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "branchId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "compensationCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcel_media_parcelId_createdAt_idx" ON "parcel_media"("parcelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "parcel_claims_claimNo_key" ON "parcel_claims"("claimNo");

-- CreateIndex
CREATE INDEX "parcel_claims_status_createdAt_idx" ON "parcel_claims"("status", "createdAt");

-- CreateIndex
CREATE INDEX "parcel_claims_parcelId_idx" ON "parcel_claims"("parcelId");

-- AddForeignKey
ALTER TABLE "parcel_media" ADD CONSTRAINT "parcel_media_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_claims" ADD CONSTRAINT "parcel_claims_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Caddayntu lama tirtiro, lama beddelo (sawir/video) · cabashooyinka lama tirtiro
CREATE TRIGGER parcel_media_no_delete BEFORE DELETE ON "parcel_media" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE TRIGGER parcel_claims_no_delete BEFORE DELETE ON "parcel_claims" FOR EACH ROW EXECUTE FUNCTION prevent_delete();
CREATE OR REPLACE FUNCTION prevent_media_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'parcel_media is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER parcel_media_no_update BEFORE UPDATE ON "parcel_media" FOR EACH ROW EXECUTE FUNCTION prevent_media_update();

