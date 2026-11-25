-- Hal cabasho furan alaab kasta (laba karraani isku mar ma furi karaan)
CREATE UNIQUE INDEX "parcel_claims_one_open" ON "parcel_claims"("parcelId") WHERE "status" = 'OPEN';
