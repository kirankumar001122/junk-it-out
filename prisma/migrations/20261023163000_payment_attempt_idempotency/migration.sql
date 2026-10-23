-- Serialize one active customer payment attempt per order.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Payment"
    WHERE "direction" = 'CUSTOMER_PAYS'
      AND "status" IN ('CREATION_PENDING', 'INITIATED', 'AUTHORIZED')
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create active payment-attempt constraint: duplicate active attempts exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX "Payment_active_customer_order_key"
ON "Payment" ("orderId")
WHERE "direction" = 'CUSTOMER_PAYS'
  AND "status" IN ('CREATION_PENDING', 'INITIATED', 'AUTHORIZED');

-- Support lookup of active attempts while preserving historical attempts.
CREATE INDEX "Payment_order_direction_status_idx"
ON "Payment" ("orderId", "direction", "status");
