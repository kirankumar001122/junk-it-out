CREATE TABLE "WalletBonusCampaign" (
  "id" TEXT NOT NULL,
  "campaignName" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "bonusType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "bonusPercentage" DOUBLE PRECISION,
  "minimumRechargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "maximumBonusAmount" DOUBLE PRECISION,
  "campaignStartDate" TIMESTAMP(3) NOT NULL,
  "campaignEndDate" TIMESTAMP(3) NOT NULL,
  "bonusExpiryDays" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletBonusCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletBonusSlab" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "minimumAmount" DOUBLE PRECISION NOT NULL,
  "maximumAmount" DOUBLE PRECISION,
  "bonusPercentage" DOUBLE PRECISION,
  "fixedBonusAmount" DOUBLE PRECISION,
  "maximumBonusAmount" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletBonusSlab_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WalletTransaction" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN "originalRechargeAmount" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN "bonusAmount" DOUBLE PRECISION;
ALTER TABLE "WalletTransaction" ADD COLUMN "bonusExpiryDate" TIMESTAMP(3);
ALTER TABLE "WalletTransaction" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");
CREATE INDEX "WalletBonusCampaign_status_isActive_campaignStartDate_campaignEndDate_idx"
  ON "WalletBonusCampaign"("status", "isActive", "campaignStartDate", "campaignEndDate");
CREATE INDEX "WalletBonusSlab_campaignId_minimumAmount_idx"
  ON "WalletBonusSlab"("campaignId", "minimumAmount");
CREATE INDEX "WalletTransaction_campaignId_status_createdAt_idx"
  ON "WalletTransaction"("campaignId", "status", "createdAt");
ALTER TABLE "WalletBonusCampaign" ADD CONSTRAINT "WalletBonusCampaign_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletBonusSlab" ADD CONSTRAINT "WalletBonusSlab_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WalletBonusCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "WalletBonusCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
