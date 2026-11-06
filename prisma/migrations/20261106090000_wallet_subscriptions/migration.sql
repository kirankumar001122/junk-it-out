CREATE TABLE IF NOT EXISTS "CustomerWallet" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "referenceId" TEXT,
  "gatewayOrderId" TEXT,
  "gatewayPaymentId" TEXT,
  "reason" TEXT,
  "adminId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubscriptionOffer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "durationMonths" INTEGER NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "benefitsJson" TEXT NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "gatewayOrderId" TEXT,
  "gatewayPaymentId" TEXT,
  "signature" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerSubscription" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "paymentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startDate" TIMESTAMP(3) NOT NULL,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerWallet_customerId_key" ON "CustomerWallet"("customerId");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_gatewayOrderId_key" ON "WalletTransaction"("gatewayOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "WalletTransaction_gatewayPaymentId_key" ON "WalletTransaction"("gatewayPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionOffer_name_durationMonths_key" ON "SubscriptionOffer"("name", "durationMonths");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_gatewayOrderId_key" ON "SubscriptionPayment"("gatewayOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_gatewayPaymentId_key" ON "SubscriptionPayment"("gatewayPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSubscription_paymentId_key" ON "CustomerSubscription"("paymentId");

CREATE INDEX IF NOT EXISTS "WalletTransaction_customerId_createdAt_idx" ON "WalletTransaction"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_status_createdAt_idx" ON "WalletTransaction"("walletId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_type_status_createdAt_idx" ON "WalletTransaction"("type", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionOffer_active_displayOrder_idx" ON "SubscriptionOffer"("active", "displayOrder");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_customerId_status_expiryDate_idx" ON "CustomerSubscription"("customerId", "status", "expiryDate");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_offerId_createdAt_idx" ON "CustomerSubscription"("offerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_customerId_createdAt_idx" ON "SubscriptionPayment"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_offerId_status_createdAt_idx" ON "SubscriptionPayment"("offerId", "status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CustomerWallet" ADD CONSTRAINT "CustomerWallet_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "CustomerWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "SubscriptionOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "SubscriptionOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "SubscriptionPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
