-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "branchId" TEXT;


-- Hal sanduuq furan hal karraani (laba tab isku mar → hal kaliya)
CREATE UNIQUE INDEX "cash_sessions_one_open" ON "cash_sessions" ("cashierId") WHERE "closedAt" IS NULL;
