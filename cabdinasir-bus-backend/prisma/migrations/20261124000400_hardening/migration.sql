-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "forceClosedById" TEXT;

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "deposits_idempotencyKey_key" ON "deposits"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_idempotencyKey_key" ON "expenses"("idempotencyKey");

