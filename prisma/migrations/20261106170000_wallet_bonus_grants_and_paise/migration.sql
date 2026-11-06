ALTER TABLE "CustomerWallet" ADD COLUMN "balancePaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerWallet" ADD COLUMN "paidBalancePaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "amountPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "balanceAfterPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "bonusGrantId" TEXT;

UPDATE "CustomerWallet" SET "balancePaise" = ROUND("balance" * 100)::INTEGER
WHERE "balancePaise" = 0 AND "balance" <> 0;
UPDATE "CustomerWallet" SET "paidBalancePaise" = "balancePaise"
WHERE "paidBalancePaise" = 0 AND "balancePaise" <> 0;
UPDATE "WalletTransaction" SET
  "amountPaise" = ROUND("amount" * 100)::INTEGER,
  "balanceAfterPaise" = ROUND("balanceAfter" * 100)::INTEGER
WHERE "amountPaise" = 0 AND ("amount" <> 0 OR "balanceAfter" <> 0);

CREATE TABLE "WalletBonusGrant" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceTransactionId" TEXT NOT NULL,
  "rechargeTransactionId" TEXT NOT NULL,
  "campaignId" TEXT,
  "grantedPaise" INTEGER NOT NULL,
  "remainingPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletBonusGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletBonusConsumption" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "walletTransactionId" TEXT NOT NULL,
  "consumedPaise" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletBonusConsumption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletBonusGrant_sourceTransactionId_key" ON "WalletBonusGrant"("sourceTransactionId");
CREATE INDEX "WalletBonusGrant_rechargeTransactionId_idx" ON "WalletBonusGrant"("rechargeTransactionId");
CREATE UNIQUE INDEX "WalletBonusConsumption_grantId_walletTransactionId_key" ON "WalletBonusConsumption"("grantId", "walletTransactionId");
CREATE INDEX "WalletBonusGrant_walletId_status_expiresAt_createdAt_idx" ON "WalletBonusGrant"("walletId", "status", "expiresAt", "createdAt");
CREATE INDEX "WalletBonusGrant_customerId_status_expiresAt_createdAt_idx" ON "WalletBonusGrant"("customerId", "status", "expiresAt", "createdAt");
CREATE INDEX "WalletBonusConsumption_walletTransactionId_idx" ON "WalletBonusConsumption"("walletTransactionId");
CREATE INDEX "WalletTransaction_bonusGrantId_idx" ON "WalletTransaction"("bonusGrantId");

ALTER TABLE "WalletBonusGrant" ADD CONSTRAINT "WalletBonusGrant_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "CustomerWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletBonusGrant" ADD CONSTRAINT "WalletBonusGrant_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletBonusGrant" ADD CONSTRAINT "WalletBonusGrant_sourceTransactionId_fkey"
  FOREIGN KEY ("sourceTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletBonusGrant" ADD CONSTRAINT "WalletBonusGrant_rechargeTransactionId_fkey"
  FOREIGN KEY ("rechargeTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletBonusGrant" ADD CONSTRAINT "WalletBonusGrant_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WalletBonusCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletBonusConsumption" ADD CONSTRAINT "WalletBonusConsumption_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "WalletBonusGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletBonusConsumption" ADD CONSTRAINT "WalletBonusConsumption_walletTransactionId_fkey"
  FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_bonusGrantId_fkey"
  FOREIGN KEY ("bonusGrantId") REFERENCES "WalletBonusGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
