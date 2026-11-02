import { db } from '../db';
import {
  deliverAgentAssignmentSms,
  getAgentAssignmentSmsNotificationId,
} from './agentBookingNotification';
import { sendAgentAssignmentSms } from './smsService';
export { normalizeAgentSmsPhone } from './smsService';
import { getSafeErrorType, logStructured } from '../observability/structuredLogger';

export type AgentAssignmentSmsDetails = {
  orderId: string;
  orderNumber: string;
  agentId: string;
  agentUserId: string;
  agentPhone: string;
  serviceArea?: string | null;
  pickupType?: string | null;
  scheduledSlot?: string | null;
  status: string;
};

function cleanMessagePart(value: string) {
  return value.replace(/[|\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildAgentAssignmentSmsContent(details: Pick<
  AgentAssignmentSmsDetails,
  'orderNumber' | 'serviceArea' | 'pickupType' | 'scheduledSlot'
>) {
  const schedule = details.pickupType === 'SCHEDULED' && details.scheduledSlot
    ? `Scheduled: ${cleanMessagePart(details.scheduledSlot)}.`
    : 'Pickup: ASAP.';
  const area = cleanMessagePart(details.serviceArea || 'address on dashboard');
  return `Junk It Out order ${cleanMessagePart(details.orderNumber)} assigned. Area: ${area}. ${schedule}`;
}

export async function deliverQueuedAgentAssignmentSms(notificationId: string) {
  const notification = await db.notification.findUnique({
    where: { id: notificationId },
    select: {
      id: true,
      recipient: true,
      content: true,
      type: true,
      provider: true,
    },
  });

  if (
    !notification ||
    notification.type !== 'AGENT_BOOKING_ASSIGNED_SMS' ||
    notification.provider !== 'FAST2SMS_SMS'
  ) {
    return false;
  }

  return deliverAgentAssignmentSms(notification, {
    claim: async (id) => {
      const staleSendingCutoff = new Date(Date.now() - 2 * 60_000);
      const claimed = await db.notification.updateMany({
        where: {
          id,
          OR: [
            { status: { in: ['QUEUED', 'FAILED'] }, deliveryAttempts: { lt: 3 } },
            { status: 'SENDING', sentAt: { lt: staleSendingCutoff }, deliveryAttempts: { lt: 3 } },
          ],
        },
        data: {
          status: 'SENDING',
          deliveryStatus: 'sending',
          statusDescription: 'Sending assigned-agent SMS.',
          deliveryAttempts: { increment: 1 },
          sentAt: new Date(),
        },
      });
      return claimed.count === 1;
    },
    send: (input) => sendAgentAssignmentSms(input),
    markSent: async (id, requestId) => {
      await db.notification.updateMany({
        where: { id, status: 'SENDING' },
        data: {
          status: 'SENT',
          deliveryStatus: 'sent',
          statusDescription: 'Accepted by Fast2SMS SMS API.',
          providerRequestId: requestId ?? null,
          sentAt: new Date(),
        },
      });
    },
    markFailed: async (id) => {
      await db.notification.updateMany({
        where: { id, status: 'SENDING' },
        data: {
          status: 'FAILED',
          deliveryStatus: 'failed',
          statusDescription: 'Fast2SMS SMS request failed; retry is available.',
        },
      });
    },
  });
}

export async function safelyDeliverQueuedAgentAssignmentSms(notificationId: string) {
  try {
    return await deliverQueuedAgentAssignmentSms(notificationId);
  } catch (error) {
    logStructured('error', 'notification.agent_sms.delivery_failed', {
      dependency: 'database',
      errorType: getSafeErrorType(error),
    });
    return false;
  }
}
