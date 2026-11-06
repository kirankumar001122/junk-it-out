ALTER TABLE "SubscriptionOffer" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "SubscriptionOffer" ADD COLUMN IF NOT EXISTS "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "SubscriptionOffer" ADD COLUMN IF NOT EXISTS "pickupLimit" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "pickupsAllowed" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "pickupsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

ALTER TABLE "SubscriptionPayment" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'RAZORPAY';
ALTER TABLE "SubscriptionPayment" ADD COLUMN IF NOT EXISTS "walletTransactionId" TEXT;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

CREATE INDEX IF NOT EXISTS "SubscriptionOffer_billingPeriod_active_idx" ON "SubscriptionOffer"("billingPeriod", "active");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_status_expiryDate_idx" ON "CustomerSubscription"("status", "expiryDate");
CREATE INDEX IF NOT EXISTS "Order_subscriptionId_idx" ON "Order"("subscriptionId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

