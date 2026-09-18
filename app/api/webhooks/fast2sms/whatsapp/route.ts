import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: NextRequest) {
  try {
    // 1. Webhook Secret Authentication Check
    const webhookSecret = process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const incomingSecret = (
        req.headers.get('x-fast2sms-secret') ||
        req.headers.get('x-webhook-secret') ||
        req.headers.get('authorization') ||
        ''
      ).trim();

      if (incomingSecret !== webhookSecret) {
        console.warn('[FAST2SMS_WEBHOOK_UNAUTHORIZED] Invalid or missing webhook secret header.');
        return errorResponse('UNAUTHORIZED', 'Invalid webhook secret authentication.', 401);
      }
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return errorResponse('BAD_REQUEST', 'Invalid JSON webhook payload.', 400);
    }

    // 2. Phone Number ID Validation
    const expectedPhoneId = (
      process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID ||
      '1238240156029770'
    ).trim();

    const payloadPhoneId = body.phone_number_id || body.phoneNumberId;
    if (payloadPhoneId && String(payloadPhoneId).trim() !== expectedPhoneId) {
      console.warn('[FAST2SMS_WEBHOOK_REJECTED] Phone Number ID mismatch:', {
        expected: expectedPhoneId,
        received: payloadPhoneId,
      });
      return errorResponse('BAD_REQUEST', 'Phone Number ID mismatch.', 400);
    }

    // 3. Extract Webhook Data
    const requestId = String(body.request_id || body.requestId || '').trim();
    const rawStatus = String(body.status || '').toLowerCase().trim();
    const statusDescription = String(body.status_description || body.description || rawStatus).trim();
    const mobile = String(body.mobile || body.recipient_id || '').trim();

    if (!requestId && !mobile) {
      return errorResponse('BAD_REQUEST', 'Webhook payload missing required request_id or mobile number.', 400);
    }

    // Map incoming status to canonical deliveryStatus (sent, delivered, read, failed)
    let incomingStatus = 'sent';
    if (['delivered', 'dlr', 'received'].includes(rawStatus)) {
      incomingStatus = 'delivered';
    } else if (['read', 'opened', 'seen'].includes(rawStatus)) {
      incomingStatus = 'read';
    } else if (['failed', 'undelivered', 'error', 'rejected', 'bounced'].includes(rawStatus)) {
      incomingStatus = 'failed';
    } else if (['sent', 'submitted'].includes(rawStatus)) {
      incomingStatus = 'sent';
    }

    // 4. Find Notification Record in DB
    let notification = null;
    if (requestId) {
      notification = await db.notification.findFirst({
        where: {
          providerRequestId: requestId,
        },
      });
    }

    if (!notification && mobile) {
      // Fallback matching by mobile number and recent WHATSAPP_DISPATCH_UPDATE notification
      const digitsOnly = mobile.replace(/\D/g, '');
      const mobilePattern = digitsOnly.slice(-10);

      notification = await db.notification.findFirst({
        where: {
          type: 'WHATSAPP_DISPATCH_UPDATE',
          recipient: { contains: mobilePattern },
        },
        orderBy: { sentAt: 'desc' },
      });
    }

    if (!notification) {
      console.log('[FAST2SMS_WEBHOOK_NOTICE] No matching notification found for webhook event:', {
        requestId: requestId || 'N/A',
        incomingStatus,
      });
      // Return 200 OK so provider does not retry endlessly for non-matching records
      return successResponse({ success: true, message: 'Webhook received; no matching notification record found.' });
    }

    // 5. Idempotency Check & Status Progression Hierarchy
    const STATUS_LEVELS: Record<string, number> = {
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 4,
    };

    const currentLevel = STATUS_LEVELS[notification.deliveryStatus || 'sent'] || 1;
    const newLevel = STATUS_LEVELS[incomingStatus] || 1;

    // Idempotent: If status is identical, return success without mutating DB
    if (notification.deliveryStatus === incomingStatus) {
      return successResponse({ success: true, message: 'Status already up to date.' });
    }

    // Prevent status regression (e.g. read -> sent) unless it's a failure event
    if (currentLevel >= newLevel && currentLevel === 3 && incomingStatus !== 'failed') {
      console.log('[FAST2SMS_WEBHOOK_IDEMPOTENT] Preserving higher notification status:', {
        current: notification.deliveryStatus,
        incoming: incomingStatus,
      });
      return successResponse({ success: true, message: 'Preserved advanced delivery status.' });
    }

    // 6. Update Notification Delivery Status
    await db.notification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: incomingStatus,
        statusDescription: statusDescription || incomingStatus,
        status: incomingStatus === 'failed' ? 'FAILED' : 'SENT',
        ...(requestId && !notification.providerRequestId ? { providerRequestId: requestId } : {}),
      },
    });

    console.log('[FAST2SMS_WEBHOOK_SUCCESS]', {
      notificationId: notification.id,
      requestId: requestId || notification.providerRequestId || 'N/A',
      oldStatus: notification.deliveryStatus,
      newStatus: incomingStatus,
    });

    return successResponse({
      success: true,
      notificationId: notification.id,
      deliveryStatus: incomingStatus,
    });
  } catch (err: any) {
    console.error('[FAST2SMS_WEBHOOK_ERROR]', err?.message || err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to process WhatsApp delivery webhook.', 500);
  }
}
