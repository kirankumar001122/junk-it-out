import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    let whereClause: any = {};
    if (authUser.role === 'CUSTOMER') {
      whereClause = { customerId: authUser.customerId || 'unmatched' };
    } else if (authUser.role === 'AGENT') {
      whereClause = { agentId: authUser.agentId || 'unmatched' };
    }

    const reviews = await db.review.findMany({
      where: whereClause,
      include: {
        customer: { include: { user: true } },
        agent: { include: { user: true } },
        order: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: reviews });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate the request
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    // 2. Require CUSTOMER role and customerId
    if (authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json({ success: false, message: 'Only customers can submit reviews.' }, { status: 403 });
    }

    const { orderId, rating, comment } = await req.json().catch(() => ({}));
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ success: false, message: 'Valid orderId is required.' }, { status: 400 });
    }

    // 3. Load the order
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found.' }, { status: 404 });
    }

    // 4. Verify the order belongs to the authenticated customer
    if (order.customerId !== authUser.customerId) {
      return NextResponse.json({ success: false, message: 'You are not authorized to submit a review for this order.' }, { status: 403 });
    }

    // 5. Verify the order has an assigned agent & 6. Use ONLY order.agentId
    if (!order.agentId) {
      return NextResponse.json({ success: false, message: 'This order does not have an assigned agent to review.' }, { status: 400 });
    }

    const targetAgentId = order.agentId; // ONLY source of truth, ignoring any client-provided agentId

    // 7 & 9. Validate rating (must be an integer between 1 and 5)
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return NextResponse.json({ success: false, message: 'Rating must be an integer between 1 and 5.' }, { status: 400 });
    }

    // 10. Duplicate-review protection
    const existingReview = await db.review.findUnique({ where: { orderId: order.id } });
    if (existingReview) {
      return NextResponse.json({ success: false, message: 'A review has already been submitted for this order.' }, { status: 409 });
    }

    // 11. Create review and return successful response
    const review = await db.review.create({
      data: {
        orderId: order.id,
        customerId: authUser.customerId,
        agentId: targetAgentId,
        rating: numericRating,
        comment: typeof comment === 'string' ? comment.trim() : '',
      },
    });

    return NextResponse.json({ success: true, data: review });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
