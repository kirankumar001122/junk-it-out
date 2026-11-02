-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "payoutId" TEXT;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "utr" TEXT;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "payoutMethod" TEXT DEFAULT 'BANK_TRANSFER';
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
ALTER TABLE "Settlement" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_financialDirection_status_createdAt_idx" ON "Order"("financialDirection", "status", "createdAt");

