import assert from 'node:assert/strict';
import {
  broadcastAgentBookingNotification,
  getAgentBookingNotificationId,
  persistAgentBookingNotificationOnce,
  type AgentBookingAssignment,
} from '../lib/services/agentBookingNotification';

async function run() {
  const storedNotifications = new Map<string, unknown>();
  const events: Array<{ event: string; payload: unknown }> = [];
  const assignment: AgentBookingAssignment = {
    orderId: 'order-1',
    orderNumber: 'JIO-BOOKING-1',
    agentId: 'agent-1',
    agentUserId: 'agent-user-1',
    status: 'AGENT_ACCEPTED',
  };

  const tx = {
    notification: {
      createMany: async ({ data }: { data: Array<{ id: string; userId: string; orderId: string; type: string }> }) => {
        let count = 0;
        for (const notification of data) {
          if (storedNotifications.has(notification.id)) continue;
          storedNotifications.set(notification.id, notification);
          count += 1;
        }
        return { count };
      },
    },
  } as unknown as Parameters<typeof persistAgentBookingNotificationOnce>[0];

  const broadcast = (event: string, payload: unknown) => events.push({ event, payload });

  // A successful assignment persists one record addressed to that agent and emits the message.
  const created = await persistAgentBookingNotificationOnce(tx, assignment);
  assert.equal(created, true);
  const notificationId = getAgentBookingNotificationId(assignment.orderId, assignment.agentId);
  const stored = storedNotifications.get(notificationId) as {
    userId: string;
    orderId: string;
    type: string;
  };
  assert.equal(stored.userId, assignment.agentUserId);
  assert.equal(stored.orderId, assignment.orderId);
  assert.equal(stored.type, 'AGENT_BOOKING_ASSIGNED');
  assert.equal(broadcastAgentBookingNotification(assignment, created, broadcast), true);

  // A retried/concurrent assignment sees the unique row and does not emit a duplicate message.
  const repeated = await persistAgentBookingNotificationOnce(tx, assignment);
  assert.equal(repeated, false);
  assert.equal(broadcastAgentBookingNotification(assignment, repeated, broadcast), false);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    event: 'AGENT_BOOKING_ASSIGNED',
    payload: {
      notificationId,
      orderId: assignment.orderId,
      orderNumber: assignment.orderNumber,
      agentId: assignment.agentId,
      status: assignment.status,
    },
  });

  // If the notification write fails inside the assignment transaction, no message is emitted.
  const failedTx = {
    notification: {
      createMany: async () => { throw new Error('simulated assignment transaction failure'); },
    },
  } as unknown as Parameters<typeof persistAgentBookingNotificationOnce>[0];
  await assert.rejects(persistAgentBookingNotificationOnce(failedTx, {
    ...assignment,
    orderId: 'order-failed',
  }), /simulated assignment transaction failure/);
  assert.equal(broadcastAgentBookingNotification({ ...assignment, orderId: 'order-failed' }, false, broadcast), false);
  assert.equal(events.length, 1);

  // A failed order/assignment path does not enter the post-assignment notification step.
  let notificationWrites = 0;
  await assert.rejects(async () => {
    await Promise.resolve().then(() => { throw new Error('simulated assignment failure'); });
    notificationWrites += 1;
    await persistAgentBookingNotificationOnce(tx, { ...assignment, orderId: 'order-not-assigned' });
  }, /simulated assignment failure/);
  assert.equal(notificationWrites, 0);
  assert.equal(events.length, 1);

  console.log('Agent booking assignment notification idempotency tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
