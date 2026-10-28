import { NextRequest } from 'next/server';
import {
  createOrder,
  OrderIdempotencyConflictError,
  InvalidCouponError,
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

    if (
      !authUser ||
      authUser.role !== 'CUSTOMER' ||
      !authUser.customerId
    ) {
      return errorResponse(
        'UNAUTHORIZED',
        'Authenticated customer session required to place a pickup order.',
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

    const order = await createOrder(
      body,
      idempotencyKey,
      authUser
    );

    return successResponse(order, 201);
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

    const limit = Math.min(
      Number(
        searchParams.get('limit')
      ) || 20,
      100
    );

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

    const orders = authUser.role === 'AGENT'
      ? await db.order.findMany({
        where: whereClause,
        select: {
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
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      : await db.order.findMany({
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

          statusHistory: {
            orderBy: {
              timestamp: 'desc',
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        take: limit,
      });

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