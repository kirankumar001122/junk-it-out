-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");
