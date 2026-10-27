import assert from 'node:assert/strict';
import {
  deliverAgentPickupNotifications,
  getAgentPickupNotificationId,
  persistAgentPickupNotificationsOnce,
  type AgentPickupOffer,
} from '../lib/services/agentBookingNotification';
import {
  filterAvailableEligibleAgents,
  haversineDistanceMeters,
  MAX_AGENT_LOCATION_AGE_MS,
  selectNearestEligibleAgent,
} from '../lib/services/agentService';

async function run() {
  const agents = [
    { id: 'agent-1', userId: 'user-1', phone: '9876543210', status: 'AVAILABLE', serviceAreas: 'JP Nagar, Jayanagar' },
    { id: 'agent-2', userId: 'user-2', phone: '9876543211', status: 'AVAILABLE', serviceAreas: 'JP Nagar' },
    { id: 'agent-3', userId: 'user-3', phone: '9876543212', status: 'AVAILABLE', serviceAreas: 'Whitefield' },
    { id: 'agent-4', userId: 'user-4', phone: '9876543213', status: 'OFFLINE', serviceAreas: 'JP Nagar' },
  ];
  const eligible = filterAvailableEligibleAgents(agents, 'JP Nagar');
  assert.deepEqual(eligible.map((agent) => agent.id), ['agent-1', 'agent-2']);

  const now = Date.now();
  const locatedAgents = [
    { id: 'far', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.95, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'near-z', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.91, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'near-a', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.91, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'wrong-area', status: 'AVAILABLE', serviceAreas: 'Whitefield', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'busy', status: 'ASSIGNED', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'stale', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now - 16 * 60_000) }] },
    { id: 'missing-location', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [] },
  ];
  assert.equal(selectNearestEligibleAgent(locatedAgents, { lat: 12.9, lng: 77.6 }, 'JP Nagar', now)?.id, 'near-a',
    'nearest eligible agent wins and equal-distance ties use agent ID');
  assert.equal(selectNearestEligibleAgent(locatedAgents, null, 'JP Nagar', now), null,
    'missing pickup coordinates do not produce an offer');
  assert.equal(selectNearestEligibleAgent(locatedAgents, { lat: 91, lng: 77.6 }, 'JP Nagar', now), null,
    'invalid pickup coordinates do not produce an offer');
  assert.equal(selectNearestEligibleAgent(locatedAgents, { lat: 12.9, lng: 77.6 }, 'Unknown', now), null,
    'no service-area eligible agent produces no offer');
  assert.ok(Math.abs(haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_195) < 50,
    'one degree of latitude at the equator is about 111.2 km');
  assert.ok(Math.abs(haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111_195) < 50,
    'one degree of longitude at the equator is about 111.2 km');
  assert.equal(selectNearestEligibleAgent([
    { id: 'future', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now + 1) }] },
    { id: 'invalid-date', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: 'invalid' }] },
    { id: 'invalid-fix', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: Number.NaN, lng: 77.6, timestamp: new Date(now) }] },
    { id: 'too-old', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now - MAX_AGENT_LOCATION_AGE_MS - 1) }] },
  ], { lat: 12.9, lng: 77.6 }, 'JP Nagar', now), null,
  'future-dated, invalid and older-than-15-minute locations are rejected');
  assert.equal(selectNearestEligibleAgent([
    { id: 'boundary', status: 'AVAILABLE', serviceAreas: 'JP Nagar', locations: [{ lat: 12.9001, lng: 77.6, timestamp: new Date(now - MAX_AGENT_LOCATION_AGE_MS) }] },
  ], { lat: 12.9, lng: 77.6 }, 'JP Nagar', now)?.id, 'boundary',
  'a location exactly 15 minutes old remains within the configured freshness window');

  const offers: AgentPickupOffer[] = [({
    orderId: 'order-1',
    orderNumber: 'JIO-TEST-1',
    agentId: eligible[0].id,
    agentUserId: eligible[0].userId,
    agentPhone: eligible[0].phone,
    pickupAddress: '12th Cross, Bengaluru 560078',
    latitude: 12.9,
    longitude: 77.6,
    mapsLink: 'https://www.google.com/maps?q=12.9%2C77.6',
  })];
  const jobs = new Map<string, { status: string; recipient: string; content: string; sentAt: Date }>();
  const tx = {
    notification: {
      createMany: async ({ data }: { data: Array<{ id: string; status: string; recipient: string; content: string }> }) => {
        let count = 0;
        for (const item of data) {
          if (jobs.has(item.id)) continue;
          jobs.set(item.id, { status: item.status, recipient: item.recipient, content: item.content, sentAt: new Date() });
          count += 1;
        }
        return { count };
      },
    },
  } as unknown as Parameters<typeof persistAgentPickupNotificationsOnce>[0];

  const insertCounts = await Promise.all([
    persistAgentPickupNotificationsOnce(tx, offers),
    persistAgentPickupNotificationsOnce(tx, offers),
  ]);
  assert.deepEqual(insertCounts.sort(), [0, 1], 'mocked concurrent duplicate inserts keep one deterministic notification');
  assert.equal(jobs.size, 1);
  assert.equal(
    getAgentPickupNotificationId('order-1', 'agent-1'),
    getAgentPickupNotificationId('order-1', 'agent-2'),
    'the durable offer key is scoped to the order so dispatch races cannot pick two agents',
  );
  assert.equal(jobs.get(getAgentPickupNotificationId('order-1', 'agent-1'))?.recipient, '9876543210');
  assert.match(jobs.get(getAgentPickupNotificationId('order-1', 'agent-1'))?.content || '', /JIO-TEST-1.*12th Cross.*12.9, 77.6.*google\.com\/maps/);

  const attempts = new Map<string, number>();
  const claimNotification = async (id: string, claimTime = Date.now()) => {
    const job = jobs.get(id);
    if (!job) return false;
    const staleSending = job.status === 'SENDING' && job.sentAt.getTime() < claimTime - 2 * 60_000;
    if (!['QUEUED', 'FAILED'].includes(job.status) && !staleSending) return false;
    job.status = 'SENDING';
    job.sentAt = new Date(claimTime);
    return true;
  };
  const deliver = (fail: boolean) => deliverAgentPickupNotifications(offers, {
    claim: claimNotification,
    send: async (offer) => {
      attempts.set(offer.agentId, (attempts.get(offer.agentId) || 0) + 1);
      return { success: !fail, requestId: 'provider-request' };
    },
    markSent: async (id) => { const job = jobs.get(id); if (job) job.status = 'SENT'; },
    markFailed: async (id) => { const job = jobs.get(id); if (job) job.status = 'FAILED'; },
  });

  await deliver(true);
  assert.equal(jobs.get(getAgentPickupNotificationId('order-1', 'agent-1'))?.status, 'FAILED');
  await deliver(false);
  assert.equal(jobs.get(getAgentPickupNotificationId('order-1', 'agent-1'))?.status, 'SENT');
  assert.equal(jobs.size, 1, 'retries reuse the original order notification');
  assert.equal(attempts.get('agent-1'), 2);

  await deliver(false);
  assert.equal(attempts.get('agent-1'), 2, 'a sent notification is not delivered again');

  const jobId = getAgentPickupNotificationId('order-1', 'agent-1');
  const job = jobs.get(jobId)!;
  job.status = 'QUEUED';
  let concurrentSends = 0;
  const concurrentDependencies = {
    claim: claimNotification,
    send: async () => {
      concurrentSends += 1;
      await Promise.resolve();
      return { success: true, requestId: 'concurrent-provider-request' };
    },
    markSent: async (id: string) => { const current = jobs.get(id); if (current) current.status = 'SENT'; },
    markFailed: async (id: string) => { const current = jobs.get(id); if (current) current.status = 'FAILED'; },
  };
  await Promise.all([
    deliverAgentPickupNotifications(offers, concurrentDependencies),
    deliverAgentPickupNotifications(offers, concurrentDependencies),
  ]);
  assert.equal(concurrentSends, 1, 'only one mocked concurrent worker claims and sends the notification');
  assert.equal(job.status, 'SENT');

  job.status = 'SENDING';
  job.sentAt = new Date(Date.now() - 3 * 60_000);
  let staleRecoverySends = 0;
  await deliverAgentPickupNotifications(offers, {
    ...concurrentDependencies,
    send: async () => {
      staleRecoverySends += 1;
      return { success: true, requestId: 'stale-recovery-request' };
    },
  });
  assert.equal(staleRecoverySends, 1, 'a stale SENDING notification can be reclaimed');
  assert.equal(job.status, 'SENT');

  job.status = 'SENDING';
  job.sentAt = new Date();
  await deliverAgentPickupNotifications(offers, {
    ...concurrentDependencies,
    send: async () => {
      staleRecoverySends += 1;
      return { success: true };
    },
  });
  assert.equal(staleRecoverySends, 1, 'a fresh SENDING notification is not reclaimed');

  console.log('Agent pickup offer notification tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
