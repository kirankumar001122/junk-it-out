CREATE TABLE "OrderIdempotency" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "OrderIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderIdempotency_customerId_key_key"
ON "OrderIdempotency" ("customerId", "key");

CREATE UNIQUE INDEX "OrderIdempotency_orderId_key"
ON "OrderIdempotency" ("orderId");

CREATE INDEX "OrderIdempotency_expiresAt_idx"
ON "OrderIdempotency" ("expiresAt");

ALTER TABLE "OrderIdempotency"
ADD CONSTRAINT "OrderIdempotency_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderIdempotency"
ADD CONSTRAINT "OrderIdempotency_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
