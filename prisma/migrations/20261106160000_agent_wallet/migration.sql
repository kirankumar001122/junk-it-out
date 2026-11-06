CREATE TABLE IF NOT EXISTS "AgentWallet" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentWalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "referenceId" TEXT,
  "orderId" TEXT,
  "reason" TEXT,
  "adminId" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentWallet_agentId_key" ON "AgentWallet"("agentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentWalletTransaction_referenceId_key" ON "AgentWalletTransaction"("referenceId");

CREATE INDEX IF NOT EXISTS "AgentWalletTransaction_agentId_createdAt_idx" ON "AgentWalletTransaction"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentWalletTransaction_walletId_status_createdAt_idx" ON "AgentWalletTransaction"("walletId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentWalletTransaction_type_status_createdAt_idx" ON "AgentWalletTransaction"("type", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentWalletTransaction_orderId_idx" ON "AgentWalletTransaction"("orderId");

DO $$ BEGIN
  ALTER TABLE "AgentWallet" ADD CONSTRAINT "AgentWallet_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentWalletTransaction" ADD CONSTRAINT "AgentWalletTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "AgentWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentWalletTransaction" ADD CONSTRAINT "AgentWalletTransaction_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentWalletTransaction" ADD CONSTRAINT "AgentWalletTransaction_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AgentWalletTransaction" ADD CONSTRAINT "AgentWalletTransaction_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
