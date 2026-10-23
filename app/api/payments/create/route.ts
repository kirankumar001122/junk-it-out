import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth/middleware";
import {
  createRazorpayOrder,
  RazorpayApiError,
} from "@/lib/payments/razorpay";
import { reconcilePaymentForOrder } from "@/lib/payments/verification";

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== "CUSTOMER" || !authUser.customerId) {
      return NextResponse.json(
        {
          success: false,
          message: "Authenticated customer access is required.",
        },
        { status: 401 },
      );
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "Order ID is required." },
        { status: 400 },
      );
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    if (order.customerId !== authUser.customerId) {
      return NextResponse.json(
        {
          success: false,
          message: "You are not authorized to pay for this order.",
        },
        { status: 403 },
      );
    }

    if (order.financialDirection !== "CUSTOMER_PAYS") {
      return NextResponse.json(
        {
          success: false,
          message: "This order does not require a customer payment.",
        },
        { status: 400 },
      );
    }

    if (
      order.status === "CANCELLED" ||
      order.status === "SETTLEMENT_COMPLETED" ||
      order.paymentStatus === "REFUNDED" ||
      order.paymentStatus === "PARTIALLY_REFUNDED" ||
      order.paymentStatus.startsWith("REFUND_")
    ) {
      return NextResponse.json(
        { success: false, message: "This order is no longer payable." },
        { status: 400 },
      );
    }

    // 1. Order already paid check
    if (
      order.paymentStatus === "CAPTURED" ||
      order.paymentStatus === "SUCCESS"
    ) {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        message: "This order has already been paid and verified.",
        data: {
          orderId: order.id,
          status: "CAPTURED",
          paymentStatus: "CAPTURED",
        },
      });
    }

    const amount = Number(order.finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "This order has no valid payable amount." },
        { status: 400 },
      );
    }

    // 2. Safely attempt reconciliation if a previous payment attempt exists
    try {
      const candidatePayment = order.payments.find(
        (payment) =>
          payment.direction === "CUSTOMER_PAYS" &&
          payment.status !== "FAILED" &&
          payment.status !== "REFUNDED" &&
          payment.status !== "PARTIALLY_REFUNDED" &&
          !payment.status.startsWith("REFUND_"),
      );

      if (candidatePayment?.gatewayOrderId) {
        const reconciliation = await reconcilePaymentForOrder(
          order.id,
          authUser,
        );
        if (
          reconciliation?.status === "CAPTURED" ||
          reconciliation?.status === "SUCCESS"
        ) {
          return NextResponse.json({
            success: true,
            alreadyPaid: true,
            message:
              "Payment was previously completed and has been reconciled successfully.",
            data: {
              orderId: order.id,
              status: "CAPTURED",
              paymentStatus: "CAPTURED",
            },
          });
        }
      }
    } catch (reconcileErr) {
      console.warn("[RECONCILE SKIPPED]", {
        errorType: reconcileErr instanceof Error ? reconcileErr.name : 'UnknownError',
      });
    }

    // 3. Create a fresh Razorpay order for payment checkout
    const razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(amount * 100),
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        amount,
        direction: "CUSTOMER_PAYS",
        gateway: "RAZORPAY",
        gatewayOrderId: razorpayOrder.id,
        status: "INITIATED",
      },
    });

    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "INITIATED" },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        gatewayOrderId: razorpayOrder.id,
        amount: payment.amount,
        currency: "INR",
        key: razorpayOrder.keyId,
        name: "Junk It Out Waste Pickup",
        description: `Pickup service charge #${order.orderNumber}`,
      },
    });
  } catch (error: any) {
    console.error("[PAYMENT CREATE ERROR]", { errorType: error instanceof Error ? error.name : 'UnknownError' });
    if (error instanceof RazorpayApiError) {
      const authenticationFailed =
        error.statusCode === 401 ||
        error.statusCode === 403 ||
        /authentication failed|invalid .*key|invalid .*credential/i.test(
          error.message,
        );
      return NextResponse.json(
        {
          success: false,
          message: authenticationFailed
            ? "Razorpay rejected the configured credentials. Set a matching active key ID and secret from the same Razorpay account and mode, then restart the server."
            : "Razorpay could not create the payment order. Please try again shortly.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to initialize payment gateway.',
      },
      { status: 500 },
    );
  }
}
