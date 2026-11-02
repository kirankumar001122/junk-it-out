import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let whereClause: any = {};
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    if (authUser.role === 'CUSTOMER') {
      whereClause = { customerId: authUser.customerId || 'unmatched' };
    } else if (authUser.role === 'AGENT') {
      whereClause = { order: { agentId: authUser.agentId || 'unmatched' } };
    } else if (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN') {
      whereClause = {};
    } else {
      return NextResponse.json({ success: false, message: 'Forbidden.' }, { status: 403 });
    }

    const complaints = await db.complaint.findMany({
      where: whereClause,
      include: {
        customer: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        order: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return NextResponse.json({ success: true, data: complaints, page, pageSize });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { orderId, category, subject, description, message, name, phone, email, photoUrl } = body;

    const ticketMessage = (description || message || '').trim();
    if (!ticketMessage) {
      return NextResponse.json({ success: false, message: 'Message description is required.' }, { status: 400 });
    }

    // 1. Unauthenticated requests: store separately in ContactEnquiry without mutating User or Customer
    if (!authUser) {
      if (orderId) {
        return NextResponse.json(
          { success: false, message: 'Authentication required to report an issue for an order.' },
          { status: 401 }
        );
      }

      const contactPhone = typeof phone === 'string' ? phone.trim() : '';
      const contactEmail = typeof email === 'string' ? email.trim() : '';

      if (!contactPhone && !contactEmail) {
        return NextResponse.json(
          { success: false, message: 'Valid contact phone or email is required to submit an enquiry.' },
          { status: 400 }
        );
      }

      const contactName = (name && typeof name === 'string' && name.trim().length >= 2) ? name.trim() : 'Guest';
      const enquirySubject = (subject && typeof subject === 'string' && subject.trim())
        ? subject.trim()
        : (category && typeof category === 'string' && category.trim())
        ? category.trim()
        : 'General Enquiry';

      const enquiry = await db.contactEnquiry.create({
        data: {
          name: contactName,
          phone: contactPhone,
          email: contactEmail,
          subject: enquirySubject,
          message: ticketMessage,
          status: 'OPEN',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Your enquiry has been received. Our support team will get back to you shortly.',
        data: enquiry,
      });
    }

    // 2. Authenticated user requests
    let customerId: string | null = authUser.customerId || null;

    let targetOrderId: string | null = null;
    if (orderId) {
      const order = await db.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return NextResponse.json({ success: false, message: 'Order not found.' }, { status: 404 });
      }

      if (order.customerId !== customerId && authUser.role !== 'ADMIN' && authUser.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, message: 'You are not authorized to report an issue for this order.' }, { status: 403 });
      }
      targetOrderId = order.id;
      if (!customerId && (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN')) {
        customerId = order.customerId;
      }
    }

    if (!customerId && (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN')) {
      const customer = await db.customer.findFirst({ where: { userId: authUser.userId } });
      customerId = customer?.id || null;
    }

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'Customer account required to file an order complaint.' },
        { status: 400 }
      );
    }

    const complaint = await db.complaint.create({
      data: {
        orderId: targetOrderId,
        customerId: customerId,
        category: category || subject || 'General Inquiry',
        description: ticketMessage,
        photoUrl: photoUrl || null,
        status: 'OPEN',
      },
    });

    return NextResponse.json({ success: true, data: complaint });
  } catch (error: any) {
    console.error('Submit complaint error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to submit complaint.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { id, status, resolutionNotes } = await req.json().catch(() => ({}));

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing complaint ID or status.' }, { status: 400 });
    }

    const updated = await db.complaint.update({
      where: { id },
      data: {
        status,
        resolutionNotes,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
