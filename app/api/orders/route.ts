import { createRazorpayOrder } from '@/lib/payments/razorpay';
import { NextRequest } from 'next/server';
import {
  createOrder,
  OrderIdempotencyConflictError,
  InvalidCouponError,
  InvalidWasteCategoryError,
  InvalidBookingWeightError,
  InvalidIdempotencyKeyError,
} from '@/lib/services/orderService';
import { validateCreateOrderInput } from '@/lib/validations/schemas';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import {
  successResponse,
  errorResponse,
} from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);

    const isAdmin = authUser && ['ADMIN', 'SUPER_ADMIN'].includes(authUser.role);
    const isCustomer = authUser && authUser.role === 'CUSTOMER' && Boolean(authUser.customerId);
    if (!isAdmin && !isCustomer) {
      return errorResponse(
        'UNAUTHORIZED',
        'Authenticated customer or admin session required to place a pickup order.',
        401
      );
    }

    const body = await req.json().catch(() => null);

    const idempotencyKey =
      req.headers.get('Idempotency-Key');

    const validation =
      validateCreateOrderInput(body);

    if (!validation.valid) {
      return errorResponse(
        'VALIDATION_ERROR',
        validation.error ||
          'Invalid booking request payload.',
        400
      );
    }

    if (idempotencyKey && !/^[A-Za-z0-9_-]{10,128}$/.test(idempotencyKey.trim())) {
      return errorResponse(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must be 10-128 characters using letters, numbers, "_" or "-".',
        400,
      );
    }

    const order = await createOrder(
      body,
      idempotencyKey,
      authUser
    );

    // If order requires customer payment, initialize the gateway order in advance
    // to eliminate a redundant sequential client-server HTTP roundtrip.
    let paymentConfig: any = null;
    if (order.financialDirection === 'CUSTOMER_PAYS' && Number(order.finalAmount) > 0 && order.paymentStatus !== 'CAPTURED') {
      try {
        const amount = Number(order.finalAmount);
        const attempt = await db.$transaction(async (tx) => {
          if (typeof (tx as any).$executeRaw === 'function') {
            await (tx as any).$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.id}, 0))`;
          } else {
            await (tx as any).$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.id}, 0))`;
          }

          const existing = await tx.payment.findFirst({
            where: {
              orderId: order.id,
              direction: 'CUSTOMER_PAYS',
              status: { in: ['CREATION_PENDING', 'INITIATED', 'AUTHORIZED'] },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (existing) {
            return { kind: 'existing' as const, payment: existing };
          }

          const created = await tx.payment.create({
            data: {
              orderId: order.id,
              amount,
              direction: 'CUSTOMER_PAYS',
              gateway: 'RAZORPAY',
              status: 'CREATION_PENDING',
            },
          });

          return { kind: 'new' as const, payment: created };
        });

        if (attempt.kind === 'existing') {
          if (attempt.payment.gatewayOrderId) {
            const key = process.env.RAZORPAY_KEY_ID || process.env.PAYMENT_KEY_ID;
            if (key) {
              paymentConfig = {
                paymentId: attempt.payment.id,
                gatewayOrderId: attempt.payment.gatewayOrderId,
                amount: attempt.payment.amount,
                currency: 'INR',
                key,
                name: 'Junk It Out Waste Pickup',
                description: `Pickup service charge #${order.orderNumber}`,
              };
            }
          }
        } else {
          const razorpayOrder = await createRazorpayOrder({
            amountInPaise: Math.round(amount * 100),
            receipt: order.orderNumber,
            notes: { orderId: order.id, orderNumber: order.orderNumber },
          });

          await db.payment.update({
            where: { id: attempt.payment.id },
            data: {
              gatewayOrderId: razorpayOrder.id,
              status: 'INITIATED',
            },
          });

          await db.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'INITIATED' },
          });

          paymentConfig = {
            paymentId: attempt.payment.id,
            gatewayOrderId: razorpayOrder.id,
            amount,
            currency: 'INR',
            key: razorpayOrder.keyId,
            name: 'Junk It Out Waste Pickup',
            description: `Pickup service charge #${order.orderNumber}`,
          };
        }
      } catch (payErr) {
        // Non-fatal: if gateway call fails or credentials are unset, order is safely preserved as PENDING
        console.warn('[ORDERS_ROUTE_PAYMENT_INIT_DEFERRED]', payErr instanceof Error ? payErr.message : payErr);
      }
    }

    const responseData = paymentConfig ? { ...order, paymentConfig } : order;
    return successResponse(responseData, 201);
  } catch (err: any) {
    console.error(
      'Order creation error:',
      err
    );

    if (
      err instanceof OrderIdempotencyConflictError ||
      err?.name === 'OrderIdempotencyConflictError'
    ) {
      return errorResponse(
        'IDEMPOTENCY_CONFLICT',
        err.message ||
          'Idempotency key was already used for a different booking payload.',
        409
      );
    }

    if (
      err instanceof InvalidCouponError ||
      err?.name === 'InvalidCouponError'
    ) {
      return errorResponse(
        'INVALID_COUPON',
        err.message || 'Invalid or ineligible coupon code.',
        400
      );
    }

    if (
      err instanceof InvalidWasteCategoryError ||
      err?.name === 'InvalidWasteCategoryError'
    ) {
      return errorResponse(
        'INVALID_WASTE_CATEGORY',
        err.message || 'One or more selected waste categories are unavailable.',
        400,
      );
    }

    if (
      err instanceof InvalidBookingWeightError ||
      err?.name === 'InvalidBookingWeightError'
    ) {
      return errorResponse(
        'INVALID_BOOKING_WEIGHT',
        err.message,
        400,
      );
    }

    if (
      err instanceof InvalidIdempotencyKeyError ||
      err?.name === 'InvalidIdempotencyKeyError'
    ) {
      return errorResponse('INVALID_IDEMPOTENCY_KEY', err.message, 400);
    }

    return errorResponse(
      'ORDER_CREATION_FAILED',
      err.message ||
        'Failed to place waste pickup order.',
      400
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser =
      await getAuthUser(req);

    if (!authUser) {
      return errorResponse(
        'UNAUTHORIZED',
        'Authentication required to view orders.',
        401
      );
    }

    const { searchParams } =
      new URL(req.url);

    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const limit = Math.min(
      Number(
        searchParams.get('limit')
      ) || 20,
      100
    );
    const skip = (page - 1) * limit;

    let whereClause: any = {};

    // =====================================================
    // CUSTOMER
    // =====================================================
    //
    // Only show CUSTOMER_PAYS orders after payment has
    // actually been captured.
    //
    // This prevents PENDING / INITIATED / AUTHORIZED orders
    // from appearing in "My Pickups".
    // =====================================================

    if (
      authUser.role === 'CUSTOMER'
    ) {
      const customerIdentityConditions = [
        ...(authUser.customerId ? [{ customerId: authUser.customerId }] : []),
        ...(authUser.userId ? [{ customer: { userId: authUser.userId } }] : []),
      ];

      whereClause = {
        ...(customerIdentityConditions.length > 0
          ? { OR: customerIdentityConditions }
          : { customerId: 'unmatched' }),

        AND: [
          {
            OR: [
              {
                financialDirection: {
                  not: 'CUSTOMER_PAYS',
                },
              },
              {
                financialDirection: 'CUSTOMER_PAYS',
                OR: [
                  {
                    paymentStatus: {
                      in: ['CAPTURED', 'REFUND_PENDING', 'REFUNDED'],
                    },
                  },
                  {
                    status: 'CANCELLED',
                  },
                ],
              },
            ],
          },
        ],
      };
    }

    // =====================================================
    // AGENT
    // =====================================================
    //
    // Defense-in-depth:
    // An agent must never receive a CUSTOMER_PAYS order
    // through this endpoint unless payment is captured.
    //
    // =====================================================

    else if (
      authUser.role === 'AGENT'
    ) {
      whereClause = {
        agentId:
          authUser.agentId ||
          'unmatched',

        OR: [
          {
            financialDirection: {
              not: 'CUSTOMER_PAYS',
            },
          },
          {
            financialDirection:
              'CUSTOMER_PAYS',

            paymentStatus:
              'CAPTURED',
          },
        ],
      };
    }

    // =====================================================
    // ADMIN / SUPER ADMIN
    // =====================================================
    //
    // Admins continue to see all orders, including pending
    // orders. This is important for operational visibility.
    //
    // =====================================================

    const AGENT_ACTIVE_STATUSES = [
      'AGENT_ASSIGNED',
      'AGENT_ACCEPTED',
      'AGENT_ON_WAY',
      'AGENT_ARRIVED',
      'WASTE_VERIFICATION',
      'WEIGHING',
    ];

    let orders: any[] = [];

    if (authUser.role === 'AGENT') {
      const agentOrderSelect = {
        id: true,
        orderNumber: true,
        agentId: true,
        status: true,
        customer: {
          select: {
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        address: {
          select: {
            name: true,
            houseNo: true,
            street: true,
            area: true,
            lat: true,
            lng: true,
            pickupInstructions: true,
          },
        },
        items: {
          select: {
            id: true,
            categoryId: true,
            estimatedWeight: true,
            actualWeight: true,
            category: { select: { id: true, name: true } },
          },
        },
      };

      // 1. Fetch active assignments for the agent
      const activeOrders = await db.order.findMany({
        where: {
          ...whereClause,
          status: { in: AGENT_ACTIVE_STATUSES },
        },
        select: agentOrderSelect,
        orderBy: { createdAt: 'desc' },
      });

      // 2. Anomaly detection: log if agent has multiple active assignments
      if (activeOrders.length > 1) {
        console.error(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            severity: 'error',
            event: 'agent.data_integrity.multiple_active_orders',
            agentId: authUser.agentId,
            activeOrderIds: activeOrders.map((o) => o.id),
            count: activeOrders.length,
            message: 'Agent has multiple active assignments; returning all active assignments.',
          })
        );
      }

      // 3. Retrieve historical orders excluding active order IDs up to remaining requested limit
      const activeIds = activeOrders.map((o) => o.id);
      const remainingLimit = Math.max(0, limit - activeOrders.length);

      const historicalOrders = remainingLimit > 0
        ? await db.order.findMany({
            where: {
              ...whereClause,
              ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
            },
            select: agentOrderSelect,
            orderBy: { createdAt: 'desc' },
            take: remainingLimit,
          })
        : [];

      orders = [...activeOrders, ...historicalOrders];
    } else {
      orders = await db.order.findMany({
        where: whereClause,

        include: {
          customer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                },
              },
            },
          },

          agent: {
            select: {
              id: true,
              userId: true,
              vehicleType: true,
              vehicleNumber: true,
              status: true,
              currentLat: true,
              currentLng: true,
              rating: true,
              serviceAreas: true,

              user: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },

          address: true,

          items: {
            include: {
              category: true,
            },
          },

          ...(authUser.role !== 'CUSTOMER' || searchParams.get('includeHistory') === 'true'
            ? {
                statusHistory: {
                  orderBy: {
                    timestamp: 'desc',
                  },
                },
              }
            : {}),
        },

        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      });
    }

    return successResponse(
      orders
    );
  } catch (err: any) {
    console.error(
      'Fetch orders error:',
      err
    );

    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Failed to fetch orders.',
      500
    );
  }
}