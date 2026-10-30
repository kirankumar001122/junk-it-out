import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import {
  buildAgentAssignmentSmsContent,
  normalizeAgentSmsPhone,
} from '../lib/services/agentAssignmentSms';
import {
  buildAgentAssignmentSmsNotificationData,
  deliverAgentAssignmentSms,
  getAgentAssignmentSmsNotificationId,
  persistAgentAssignmentSmsOnce,
} from '../lib/services/agentBookingNotification';
import { sendAgentAssignmentSms } from '../lib/services/smsService';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FAST2SMS_API_KEY;
  delete process.env.FAST2SMS_AGENT_SMS_MESSAGE_ID;
  delete process.env.FAST2SMS_AGENT_SMS_SENDER_ID;
});

describe('assigned-agent SMS notifications', () => {
  it('normalizes Indian mobile numbers and builds a concise message', () => {
    assert.equal(normalizeAgentSmsPhone('+91 98765 43210'), '9876543210');
    assert.equal(normalizeAgentSmsPhone('09876543210'), '9876543210');
    assert.equal(normalizeAgentSmsPhone('12345'), null);
    assert.equal(
      buildAgentAssignmentSmsContent({
        orderNumber: 'JIO|123',
        serviceArea: 'JP Nagar\n',
        pickupType: 'SCHEDULED',
        scheduledSlot: '10:00|11:00',
      }),
      'Junk It Out order JIO 123 assigned. Area: JP Nagar. Scheduled: 10:00 11:00.',
    );
  });

  it('rejects missing configuration and invalid recipients without calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const missingConfig = await sendAgentAssignmentSms({
      agentPhone: '9876543210',
      message: 'assignment',
    });
    assert.equal(missingConfig.success, false);
    assert.equal(fetchMock.mock.calls.length, 0);

    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_AGENT_SMS_MESSAGE_ID = 'template-1';
    process.env.FAST2SMS_AGENT_SMS_SENDER_ID = 'JUNKIT';
    const invalidRecipient = await sendAgentAssignmentSms({
      agentPhone: '12345',
      message: 'assignment',
    });
    assert.equal(invalidRecipient.success, false);
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  it('sends an approved Fast2SMS template request and handles provider failure', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_AGENT_SMS_MESSAGE_ID = 'template-1';
    process.env.FAST2SMS_AGENT_SMS_SENDER_ID = 'JUNKIT';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        return: true,
        request_id: 'request-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        return: false,
        message: 'rejected',
      }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const sent = await sendAgentAssignmentSms({
      agentPhone: '+91 9876543210',
      message: 'assignment',
    });
    assert.deepEqual(sent, { success: true, requestId: 'request-1' });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    assert.equal(request.method, 'POST');
    assert.match(String(request.body), /"numbers":"9876543210"/);

    const failed = await sendAgentAssignmentSms({
      agentPhone: '9876543210',
      message: 'assignment',
    });
    assert.equal(failed.success, false);
  });

  it('does not expose provider exception details', async () => {
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_AGENT_SMS_MESSAGE_ID = 'template-1';
    process.env.FAST2SMS_AGENT_SMS_SENDER_ID = 'JUNKIT';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('authorization secret and internal URL')),
    );

    const result = await sendAgentAssignmentSms({
      agentPhone: '9876543210',
      message: 'assignment',
    });

    assert.deepEqual(result, {
      success: false,
      error: 'Fast2SMS request failed.',
    });
    assert.doesNotMatch(result.error || '', /authorization secret|internal URL/);
  });

  it('persists one deterministic notification and delivers only when claimed', async () => {
    const data = buildAgentAssignmentSmsNotificationData({
      orderId: 'order-1',
      orderNumber: 'JIO-1',
      agentId: 'agent-1',
      agentUserId: 'user-1',
      agentPhone: '9876543210',
      status: 'AGENT_ACCEPTED',
      content: 'assignment',
    });
    assert.equal(data.id, getAgentAssignmentSmsNotificationId('order-1', 'agent-1'));

    const stored = new Set<string>();
    const tx = {
      notification: {
        createMany: async ({ data: rows }: { data: Array<{ id: string }> }) => {
          const created = rows.filter((row) => !stored.has(row.id));
          created.forEach((row) => stored.add(row.id));
          return { count: created.length };
        },
      },
    } as unknown as Parameters<typeof persistAgentAssignmentSmsOnce>[0];
    const assignment = {
      orderId: 'order-1',
      orderNumber: 'JIO-1',
      agentId: 'agent-1',
      agentUserId: 'user-1',
      agentPhone: '9876543210',
      status: 'AGENT_ACCEPTED',
      content: 'assignment',
    };
    assert.equal(await persistAgentAssignmentSmsOnce(tx, assignment), true);
    assert.equal(await persistAgentAssignmentSmsOnce(tx, assignment), false);

    let claimed = false;
    let sent = 0;
    const dependencies = {
      claim: async () => {
        if (claimed) return false;
        claimed = true;
        return true;
      },
      send: async () => {
        sent += 1;
        return { success: true, requestId: 'request-1' };
      },
      markSent: async () => undefined,
      markFailed: async () => undefined,
    };
    const [first, second] = await Promise.all([
      deliverAgentAssignmentSms(data, dependencies),
      deliverAgentAssignmentSms(data, dependencies),
    ]);
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(sent, 1);
  });

  it('recovers a queued notification on a later request without creating another record', async () => {
    const data = buildAgentAssignmentSmsNotificationData({
      orderId: 'order-recovery',
      orderNumber: 'JIO-RECOVERY',
      agentId: 'agent-1',
      agentUserId: 'user-1',
      agentPhone: '9876543210',
      status: 'AGENT_ASSIGNED',
      content: 'assignment',
    });
    let claimCount = 0;
    let sendCount = 0;
    const dependencies = {
      claim: async (notificationId: string) => {
        assert.equal(notificationId, data.id);
        claimCount += 1;
        return claimCount === 1;
      },
      send: async () => {
        sendCount += 1;
        return { success: true, requestId: 'recovery-request' };
      },
      markSent: async () => undefined,
      markFailed: async () => undefined,
    };

    assert.equal(await deliverAgentAssignmentSms(data, dependencies), true);
    assert.equal(await deliverAgentAssignmentSms(data, dependencies), false);
    assert.equal(sendCount, 1);
  });

  it('records provider failure and does not retry beyond the claim decision', async () => {
    let failed = 0;
    let sends = 0;
    const dependencies = {
      claim: async () => failed < 3,
      send: async () => {
        sends += 1;
        return { success: false, error: 'provider rejected request' };
      },
      markSent: async () => undefined,
      markFailed: async (_id: string, error?: string) => {
        failed += 1;
        assert.equal(error, 'provider rejected request');
      },
    };

    const notification = {
      id: 'agent-assignment-sms-retry',
      recipient: '9876543210',
      content: 'assignment',
    };
    assert.equal(await deliverAgentAssignmentSms(notification, dependencies), false);
    assert.equal(await deliverAgentAssignmentSms(notification, dependencies), false);
    assert.equal(await deliverAgentAssignmentSms(notification, dependencies), false);
    assert.equal(await deliverAgentAssignmentSms(notification, dependencies), false);
    assert.equal(sends, 3);
    assert.equal(failed, 3);
  });
});
