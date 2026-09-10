import { NextRequest } from 'next/server';
import { createOrder } from '@/lib/services/orderService';
import { validateCreateOrderInput } from '@/lib/validations/schemas';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return errorResponse('UNAUTHORIZED', 'Authenticated customer session required to place a pickup order.', 401);
    }

    const body = await req.json().catch(() => null);
    const idempotencyKey = req.headers.get('Idempotency-Key');

    // 1. Request payload validation
    const validation = validateCreateOrderInput(body);
    if (!validation.valid) {
      return errorResponse('VALIDATION_ERROR', validation.error || 'Invalid booking request payload.', 400);
    }

    // 2. Execute Order Creation (with transaction & idempotency)
    const order = await createOrder(body, idempotencyKey, authUser);
    return successResponse(order, 201);
  } catch (err: any) {
    console.error('Order creation error:', err);
    return errorResponse('ORDER_CREATION_FAILED', err.message || 'Failed to place waste pickup order.', 400);
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return errorResponse('UNAUTHORIZED', 'Authentication required to view orders.', 401);
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

    // Authorization Scoping
    let whereClause: any = {};
    if (authUser.role === 'CUSTOMER') {
      whereClause = { customerId: authUser.customerId || 'unmatched' };
    } else if (authUser.role === 'AGENT') {
      whereClause = { agentId: authUser.agentId || 'unmatched' };
    }

    const orders = await db.order.findMany({
      where: whereClause,
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
        statusHistory: { orderBy: { timestamp: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return successResponse(orders);
  } catch (err: any) {
    console.error('Fetch orders error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch orders.', 500);
  }
}
