type PaymentGateOrder = {
  financialDirection: string;
  paymentStatus: string;
};

export function isOrderPaymentGateSatisfied(order: PaymentGateOrder) {
  return (
    order.financialDirection !== 'CUSTOMER_PAYS' ||
    order.paymentStatus === 'CAPTURED'
  );
}
