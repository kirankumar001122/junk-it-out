-- CreateTable: Ensure RefundRequest table exists for customer order cancellations and refund workflows
CREATE TABLE IF NOT EXISTS "RefundRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN_REVIEW',
    "amount" DOUBLE PRECISION NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "razorpayRefundId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_orderId_key" ON "RefundRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_paymentId_key" ON "RefundRequest"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_razorpayRefundId_key" ON "RefundRequest"("razorpayRefundId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefundRequest_orderId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefundRequest_paymentId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefundRequest_requestedByUserId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_requestedByUserId_fkey"
      FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefundRequest_reviewedByUserId_fkey'
  ) THEN
    ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewedByUserId_fkey"
      FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
