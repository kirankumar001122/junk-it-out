import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { validateDisputeTransition, DISPUTE_STATUSES } from '@/lib/validations/disputeTransitions';
import { broadcaster } from '@/lib/realtime';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));

    const complaints = await db.complaint.findMany({
      include: {
        order: { select: { orderNumber: true } },
        customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const formatted = complaints.map((c) => {
      let internalNotes: string | null = null;
      let customerUpdate: string | null = null;
      let resolutionDetails: string | null = null;

      if (c.resolutionNotes) {
        try {
          const parsed = JSON.parse(c.resolutionNotes);
          if (typeof parsed === 'object' && parsed !== null) {
            internalNotes = parsed.internalNotes || null;
            customerUpdate = parsed.customerUpdate || null;
            resolutionDetails = parsed.resolutionDetails || parsed.resolutionNotes || null;
          } else {
            resolutionDetails = c.resolutionNotes;
          }
        } catch {
          resolutionDetails = c.resolutionNotes;
        }
      }

      return {
        id: c.id,
        orderId: c.orderId,
        orderNumber: c.order?.orderNumber || 'General Support',
        customerName: c.customer?.user?.name || 'Customer',
        customerPhone: c.customer?.user?.phone || '—',
        category: c.category,
        description: c.description,
        message: c.description,
        status: c.status,
        photoUrl: c.photoUrl,
        resolutionNotes: resolutionDetails || c.resolutionNotes,
        internalNotes,
        customerUpdate,
        createdAt: new Date(c.createdAt).toLocaleString('en-IN', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    });

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin complaints error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, resolutionNotes, internalNotes, customerUpdate, evidenceUrl } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Missing or invalid complaint ID.' }, { status: 400 });
    }

    const targetStatus = (status || '').toUpperCase().trim();
    if (!targetStatus) {
      return NextResponse.json({
        success: false,
        message: `Status is required. Must be one of: ${DISPUTE_STATUSES.join(', ')}`,
      }, { status: 400 });
    }

    const recognizedStatuses: string[] = [...DISPUTE_STATUSES, 'PENDING', 'IN_PROGRESS', 'DISMISSED', 'CLOSED', 'INVESTIGATING'];
    if (!recognizedStatuses.includes(targetStatus)) {
      return NextResponse.json({
        success: false,
        message: `Invalid dispute status "${status}". Permitted statuses are: ${DISPUTE_STATUSES.join(', ')}`,
      }, { status: 400 });
    }

    const existing = await db.complaint.findUnique({
      where: { id: id.trim() },
      include: {
        customer: { include: { user: { select: { id: true, name: true, phone: true } } } },
        order: { select: { id: true, orderNumber: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: 'Complaint record not found.' }, { status: 404 });
    }

    // Validate Status Transition
    const transitionCheck = validateDisputeTransition(existing.status, targetStatus);
    if (!transitionCheck.valid) {
      return NextResponse.json({
        success: false,
        message: transitionCheck.error,
      }, { status: 400 });
    }

    const sanitizedInternalNotes =
      typeof internalNotes === 'string' && internalNotes.trim()
        ? internalNotes.trim().slice(0, 1000)
        : null;

    const sanitizedCustomerUpdate =
      typeof customerUpdate === 'string' && customerUpdate.trim()
        ? customerUpdate.trim().slice(0, 1000)
        : null;

    const sanitizedResolutionNotes =
      typeof resolutionNotes === 'string' && resolutionNotes.trim()
        ? resolutionNotes.trim().slice(0, 1000)
        : null;

    // Structured storage in resolutionNotes
    const structuredNotes = JSON.stringify({
      internalNotes: sanitizedInternalNotes,
      customerUpdate: sanitizedCustomerUpdate,
      resolutionDetails: sanitizedResolutionNotes,
      updatedAt: new Date().toISOString(),
    });

    const updated = await db.complaint.update({
      where: { id: id.trim() },
      data: {
        status: targetStatus,
        resolutionNotes: structuredNotes,
        ...(evidenceUrl ? { photoUrl: String(evidenceUrl).trim() } : {}),
      },
    });

    // Audit Logging
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'DISPUTE_STATUS_UPDATED',
        oldValue: JSON.stringify({
          disputeId: existing.id,
          status: existing.status,
        }),
        newValue: JSON.stringify({
          disputeId: existing.id,
          status: targetStatus,
          customerUpdate: sanitizedCustomerUpdate,
          internalNotes: sanitizedInternalNotes,
          resolutionNotes: sanitizedResolutionNotes,
          timestamp: new Date().toISOString(),
        }),
      },
    }).catch(() => null);

    // Customer Notification
    if (existing.customer?.user) {
      const customerUserId = existing.customer.user.id;
      const customerPhone = existing.customer.user.phone || 'Customer';
      const refCode = `JIO-${existing.id.slice(0, 8).toUpperCase()}`;
      const statusTitle = targetStatus.replace(/_/g, ' ');
      const notifContent = sanitizedCustomerUpdate
        ? `Update on your dispute (${refCode}): Status is now "${statusTitle}". ${sanitizedCustomerUpdate}`
        : `Your Junk It Out dispute (${refCode}) status has been updated to "${statusTitle}". View details in Customer Support.`;

      await db.notification.create({
        data: {
          userId: customerUserId,
          orderId: existing.orderId,
          type: 'WHATSAPP',
          recipient: customerPhone,
          content: notifContent,
          status: 'QUEUED',
          deliveryStatus: 'pending_provider_template',
          statusDescription: 'Notification recorded locally; external WhatsApp delivery pending Fast2SMS DLT dispute template registration.',
        },
      }).catch(() => null);
    }

    // Realtime Broadcast
    broadcaster.broadcast('DISPUTE_UPDATED', {
      disputeId: existing.id,
      oldStatus: existing.status,
      newStatus: targetStatus,
      customerUpdate: sanitizedCustomerUpdate,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        resolutionNotes: sanitizedResolutionNotes,
        internalNotes: sanitizedInternalNotes,
        customerUpdate: sanitizedCustomerUpdate,
      },
    });
  } catch (error: any) {
    console.error('Update complaint error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
