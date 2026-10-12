import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { createOrder } from '@/lib/services/orderService';
import { validateCreateOrderInput } from '@/lib/validations/schemas';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { LEGACY_ADDRESS_SELECT } from '@/lib/services/customerService';
import { readWithFormattedAddressFallback } from '@/lib/orders/readWithFormattedAddressFallback';
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

    if (!['CUSTOMER', 'AGENT', 'ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return errorResponse('FORBIDDEN', 'You are not authorized to view orders.', 403);
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
      whereClause = {
        customerId:
          authUser.customerId ||
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

    const orderQuery = {
      where: whereClause,
      include: {
          customer: {
            include: {
              user: true,
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

          settlement: true,
      },
      orderBy: {
        createdAt: 'desc' as const,
      },
      take: limit,
    } satisfies Prisma.OrderFindManyArgs;

    const orders = await readWithFormattedAddressFallback(
      () => db.order.findMany(orderQuery),
      () => db.order.findMany({
        ...orderQuery,
        include: {
          ...orderQuery.include,
          address: { select: LEGACY_ADDRESS_SELECT },
        },
      }),
      (legacyOrders) => legacyOrders.map((order) => ({
        ...order,
        address: order.address
          ? { ...order.address, formattedAddress: null }
          : null,
      }))
    );

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
