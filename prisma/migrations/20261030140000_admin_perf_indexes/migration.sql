-- CreateIndex
CREATE INDEX "Payment_status_amount_idx" ON "Payment"("status", "amount");

-- CreateIndex
CREATE INDEX "Coupon_active_expiryDate_idx" ON "Coupon"("active", "expiryDate");
