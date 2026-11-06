import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { broadcaster } from '@/lib/realtime';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawParams = await params;
    const id = rawParams?.id?.trim();
    if (!id) {
      return NextResponse.json({ success: false, message: 'Dispute ID is required.' }, { status: 400 });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    const complaint = await db.complaint.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            user: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            scheduledSlot: true,
            finalAmount: true,
            estimatedTotal: true,
            createdAt: true,
            address: {
              select: {
                area: true,
                street: true,
                city: true,
                pincode: true,
              },
            },
          },
        },
      },
    });

    if (!complaint) {
      return NextResponse.json({ success: false, message: 'Dispute ticket not found.' }, { status: 404 });
    }

    const isCustomer = authUser.role === 'CUSTOMER';
    const isOwner =
      complaint.customerId === authUser.customerId ||
      complaint.customer?.user?.id === authUser.userId;

    if (isCustomer && !isOwner) {
      return NextResponse.json(
        { success: false, message: 'You are not authorized to view this dispute.' },
        { status: 403 }
      );
    }

    // Parse structured notes
    let internalNotes: string | null = null;
    let customerUpdate: string | null = null;
    let resolutionDetails: string | null = null;

    if (complaint.resolutionNotes) {
      try {
        const parsed = JSON.parse(complaint.resolutionNotes);
        if (typeof parsed === 'object' && parsed !== null) {
          internalNotes = parsed.internalNotes || null;
          customerUpdate = parsed.customerUpdate || null;
          resolutionDetails = parsed.resolutionDetails || parsed.resolutionNotes || null;
        } else {
          resolutionDetails = complaint.resolutionNotes;
        }
      } catch {
        resolutionDetails = complaint.resolutionNotes;
      }
    }

    // Retrieve audit log trail for this dispute
    const auditLogs = await db.auditLog.findMany({
      where: {
        action: { in: ['DISPUTE_FILED', 'DISPUTE_STATUS_UPDATED', 'DISPUTE_CUSTOMER_RESPONDED', 'COMPLAINT_UPDATED'] },
        OR: [
          { newValue: { contains: complaint.id } },
          { oldValue: { contains: complaint.id } },
        ],
      },
      orderBy: { timestamp: 'asc' },
    });

    // Build chronological timeline
    const timeline = [
      {
        id: `step-open-${complaint.id}`,
        status: 'OPEN',
        title: 'Dispute Filed',
        description: complaint.description || 'Customer submitted support dispute ticket.',
        timestamp: complaint.createdAt.toISOString(),
        actorRole: 'CUSTOMER',
        evidenceUrl: complaint.photoUrl || null,
      },
    ];

    for (const log of auditLogs) {
      let logPayload: any = {};
      try {
        logPayload = JSON.parse(log.newValue || '{}');
      } catch {
        logPayload = { notes: log.newValue };
      }

      const st = (logPayload.status || '').toUpperCase();
      if (!st || st === 'OPEN') continue;

      let title = `Status changed to ${st.replace(/_/g, ' ')}`;
      if (st === 'UNDER_REVIEW') title = 'Under Operations Review';
      else if (st === 'AWAITING_CUSTOMER') title = 'Awaiting Customer Information';
      else if (st === 'RESOLVED') title = 'Dispute Resolved';
      else if (st === 'REJECTED') title = 'Dispute Rejected';

      timeline.push({
        id: log.id,
        status: st,
        title,
        description: isCustomer
          ? logPayload.customerUpdate || logPayload.resolutionNotes || 'Status update logged by support operations.'
          : logPayload.internalNotes
          ? `${logPayload.customerUpdate ? `[Customer Update]: ${logPayload.customerUpdate}\n` : ''}[Internal Note]: ${logPayload.internalNotes}`
          : logPayload.customerUpdate || logPayload.resolutionNotes || 'Status update logged.',
        timestamp: log.timestamp.toISOString(),
        actorRole: log.action === 'DISPUTE_CUSTOMER_RESPONDED' ? 'CUSTOMER' : 'SUPPORT',
        evidenceUrl: logPayload.evidenceUrl || null,
      });
    }

    // If terminal status was reached but not present in timeline, append
    const currentStatus = complaint.status.toUpperCase();
    if (
      (currentStatus === 'RESOLVED' || currentStatus === 'REJECTED') &&
      !timeline.some((t) => t.status === currentStatus)
    ) {
      timeline.push({
        id: `step-final-${complaint.id}`,
        status: currentStatus,
        title: currentStatus === 'RESOLVED' ? 'Dispute Resolved' : 'Dispute Rejected',
        description: resolutionDetails || customerUpdate || 'Operations review completed.',
        timestamp: complaint.updatedAt.toISOString(),
        actorRole: 'SUPPORT',
        evidenceUrl: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: complaint.id,
        referenceNumber: `JIO-${complaint.id.slice(0, 8).toUpperCase()}`,
        orderId: complaint.orderId,
        customerId: complaint.customerId,
        category: complaint.category,
        description: complaint.description,
        status: complaint.status,
        photoUrl: complaint.photoUrl,
        customerUpdate,
        resolutionDetails,
        internalNotes: isCustomer ? undefined : internalNotes,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        order: complaint.order,
        timeline,
      },
    });
  } catch (error: any) {
    console.error('Get dispute details error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rawParams = await params;
    const id = rawParams?.id?.trim();
    if (!id) {
      return NextResponse.json({ success: false, message: 'Dispute ID is required.' }, { status: 400 });
    }

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    const complaint = await db.complaint.findUnique({
      where: { id },
      include: {
        customer: { include: { user: true } },
      },
    });

    if (!complaint) {
      return NextResponse.json({ success: false, message: 'Dispute ticket not found.' }, { status: 404 });
    }

    const isOwner =
      complaint.customerId === authUser.customerId ||
      complaint.customer?.user?.id === authUser.userId;

    if (!isOwner && !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, message: 'You are not authorized to respond to this dispute.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const photoUrl = typeof body.photoUrl === 'string' ? body.photoUrl.trim() : null;

    if (!message && !photoUrl) {
      return NextResponse.json(
        { success: false, message: 'A response message or evidence photo is required.' },
        { status: 400 }
      );
    }

    // When customer responds to an AWAITING_CUSTOMER dispute, move status back to UNDER_REVIEW
    const nextStatus = 'UNDER_REVIEW';

    // Parse existing resolution notes to preserve internal notes
    let existingInternal: string | null = null;
    try {
      if (complaint.resolutionNotes) {
        const parsed = JSON.parse(complaint.resolutionNotes);
        existingInternal = parsed.internalNotes || null;
      }
    } catch {}

    const updatedNotes = JSON.stringify({
      internalNotes: existingInternal,
      customerUpdate: `Customer provided additional details: ${message}`,
      updatedAt: new Date().toISOString(),
    });

    const updated = await db.complaint.update({
      where: { id },
      data: {
        status: nextStatus,
        resolutionNotes: updatedNotes,
        ...(photoUrl ? { photoUrl } : {}),
      },
    });

    // Record audit entry
    await db.auditLog.create({
      data: {
        userId: authUser.userId || null,
        userName: authUser.phone || 'Customer',
        action: 'DISPUTE_CUSTOMER_RESPONDED',
        oldValue: JSON.stringify({ status: complaint.status }),
        newValue: JSON.stringify({
          disputeId: complaint.id,
          status: nextStatus,
          customerMessage: message,
          evidenceUrl: photoUrl,
          timestamp: new Date().toISOString(),
        }),
      },
    }).catch(() => null);

    broadcaster.broadcast('DISPUTE_UPDATED', {
      disputeId: complaint.id,
      oldStatus: complaint.status,
      newStatus: nextStatus,
      customerMessage: message,
    });

    return NextResponse.json({
      success: true,
      message: 'Your response and evidence have been submitted. Our support team will review it.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Customer respond dispute error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

