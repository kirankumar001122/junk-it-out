import assert from 'node:assert/strict';
import {
  createSseResponse,
  formatSseEvent,
  SSE_HEADERS,
  type RealtimeEvent,
} from '../lib/sse';
import {
  createBoundedDispatcher,
  getCustomerEventOrderId,
  isActiveTrackingStatus,
  isAgentEventForAgent,
  shouldForwardCustomerEvent,
  type CustomerTrackingState,
} from '../lib/sseTracking';

async function testSseHeadersAndFormatting() {
  assert.equal(SSE_HEADERS['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.equal(SSE_HEADERS['Cache-Control'], 'no-cache, no-transform');
  assert.equal('Connection' in SSE_HEADERS, false);
  assert.equal(formatSseEvent('ORDER_UPDATED', { id: 'order-1' }),
    'event: ORDER_UPDATED\ndata: {"id":"order-1"}\n\n');
  assert.throws(() => formatSseEvent('ORDER_UPDATED\ndata: injected', {}));

  const response = createSseResponse({
    signal: new AbortController().signal,
    subscribe: () => () => {},
    connectedPayload: { status: 'connected' },
    onEvent: () => {},
    heartbeatIntervalMs: 0,
  });
  assert.equal(response.headers.get('Content-Type'), SSE_HEADERS['Content-Type']);
  assert.equal(response.headers.get('Cache-Control'), SSE_HEADERS['Cache-Control']);
  assert.equal(response.headers.has('Connection'), false);
}

async function testCustomerOwnershipAndOrderFiltering() {
  const state: CustomerTrackingState = {
    trackedOrderId: 'order-a',
    assignedAgentId: 'agent-a',
    orderStatus: 'AGENT_ON_WAY',
  };
  const ownedOrderIds = new Set(['order-a']);
  const isOwnedOrder = (id: string) => ownedOrderIds.has(id);

  assert.equal(await shouldForwardCustomerEvent(
    { event: 'ORDER_UPDATED', payload: { id: 'order-a', status: 'AGENT_ARRIVED', agentId: 'agent-a' } },
    state,
    isOwnedOrder,
  ), true);
  assert.equal(state.orderStatus, 'AGENT_ARRIVED');

  // A full order's generic `id` is recognized only for ORDER_UPDATED.
  assert.equal(getCustomerEventOrderId('ORDER_UPDATED', { id: 'order-a' }), 'order-a');
  assert.equal(getCustomerEventOrderId('UNRELATED_EVENT', { id: 'order-a' }), null);
  assert.equal(getCustomerEventOrderId('AGENT_LOCATION_UPDATED', { id: 'order-a' }), null);

  assert.equal(await shouldForwardCustomerEvent(
    { event: 'ORDER_UPDATED', payload: { id: 'order-b', status: 'AGENT_ARRIVED' } },
    state,
    isOwnedOrder,
  ), false, 'tracked stream must reject a different order');
  assert.equal(await shouldForwardCustomerEvent(
    { event: 'ORDER_COMPLETED', payload: { orderId: 'other-customer-order', invoiceNumber: 'INV-1' } },
    { trackedOrderId: null, assignedAgentId: null, orderStatus: null },
    isOwnedOrder,
  ), false, 'global stream must reject orders not owned by its customer');
  assert.equal(await shouldForwardCustomerEvent(
    { event: 'UNRELATED_EVENT', payload: { orderId: 'order-a' } },
    state,
    isOwnedOrder,
  ), false, 'unknown event types must never be forwarded');

  let checkedOrderId = '';
  assert.equal(await shouldForwardCustomerEvent(
    { event: 'ORDER_ASSIGNED', payload: { orderId: 'db-order-id', orderNumber: 'JIO-100', agentId: 'agent-a' } },
    { trackedOrderId: null, assignedAgentId: null, orderStatus: null },
    async (id) => {
      checkedOrderId = id;
      return id === 'db-order-id';
    },
  ), true, 'global stream authorization checks the broadcaster database ID');
  assert.equal(checkedOrderId, 'db-order-id', 'order numbers are not substituted for event database IDs');

  await assert.rejects(
    shouldForwardCustomerEvent(
      { event: 'ORDER_COMPLETED', payload: { orderId: 'db-order-id' } },
      { trackedOrderId: null, assignedAgentId: null, orderStatus: null },
      async () => { throw new Error('authorization query failed'); },
    ),
    /authorization query failed/,
    'a failed authorization must reject instead of allowing the event',
  );
}

async function testLocationAssignmentAndLifecycle() {
  const state: CustomerTrackingState = {
    trackedOrderId: 'order-a',
    assignedAgentId: 'agent-a',
    orderStatus: 'AGENT_ON_WAY',
  };
  const owned = () => true;
  const location = (orderId: string, agentId: string): RealtimeEvent => ({
    event: 'AGENT_LOCATION_UPDATED',
    payload: { orderId, agentId, lat: 12.9, lng: 77.5 },
  });

  assert.equal(isActiveTrackingStatus('AGENT_ASSIGNED'), true);
  assert.equal(isActiveTrackingStatus('WEIGHING'), true);
  assert.equal(isActiveTrackingStatus('PICKUP_COMPLETED'), false);
  assert.equal(isActiveTrackingStatus('SETTLEMENT_COMPLETED'), false);
  assert.equal(isActiveTrackingStatus('CANCELLED'), false);

  assert.equal(await shouldForwardCustomerEvent(location('order-a', 'agent-a'), state, owned), true);
  assert.equal(await shouldForwardCustomerEvent(location('order-a', 'agent-b'), state, owned), false);
  assert.equal(await shouldForwardCustomerEvent(location('order-b', 'agent-a'), state, owned), false);
  assert.equal(await shouldForwardCustomerEvent(
    { event: 'AGENT_LOCATION_UPDATED', payload: { orderId: 'order-a', agentId: 'agent-a', id: 'wrong-generic-id', lat: 1, lng: 2 } },
    state,
    owned,
  ), true, 'location ownership uses explicit orderId and assigned agent');

  const lifecycleEvents: RealtimeEvent[] = [
    { event: 'AGENT_ASSIGNED', payload: { orderId: 'order-a', agentId: 'agent-a', status: 'AGENT_ACCEPTED' } },
    { event: 'AGENT_STARTED', payload: { orderId: 'order-a', agentId: 'agent-a' } },
    { event: 'AGENT_ARRIVED', payload: { orderId: 'order-a', agentId: 'agent-a' } },
    { event: 'WEIGHING_STARTED', payload: { orderId: 'order-a', actualTotal: 12 } },
  ];
  const expectedStatuses = ['AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WEIGHING'];
  for (const [index, event] of lifecycleEvents.entries()) {
    assert.equal(await shouldForwardCustomerEvent(event, state, owned), true);
    assert.equal(state.orderStatus, expectedStatuses[index]);
  }

  assert.equal(await shouldForwardCustomerEvent(
    { event: 'ORDER_COMPLETED', payload: { orderId: 'order-a' } },
    state,
    owned,
  ), true);
  assert.equal(state.orderStatus, 'PICKUP_COMPLETED');
  assert.equal(await shouldForwardCustomerEvent(location('order-a', 'agent-a'), state, owned), false);

  for (const terminalStatus of ['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'CANCELLED']) {
    assert.equal(await shouldForwardCustomerEvent(
      { event: 'ORDER_UPDATED', payload: { id: 'order-a', status: terminalStatus } },
      state,
      owned,
    ), true);
    assert.equal(await shouldForwardCustomerEvent(location('order-a', 'agent-a'), state, owned), false);
  }
}

async function testAgentEventTargeting() {
  assert.equal(isAgentEventForAgent('NEW_PICKUP_AVAILABLE', { targetAgentIds: ['agent-a'] }, 'agent-a'), true);
  assert.equal(isAgentEventForAgent('NEW_PICKUP_AVAILABLE', { targetAgentIds: ['agent-b'] }, 'agent-a'), false);
  assert.equal(isAgentEventForAgent('ORDER_UPDATED', { agentId: 'agent-a' }, 'agent-a'), true);
  assert.equal(isAgentEventForAgent('ORDER_UPDATED', { agentId: 'agent-b' }, 'agent-a'), false);
  assert.equal(isAgentEventForAgent('WEIGHING_STARTED', { orderId: 'order-a', agentId: 'agent-a' }, 'agent-a'), true);
  assert.equal(isAgentEventForAgent('WEIGHING_STARTED', { orderId: 'order-a' }, 'agent-a'), false,
    'order lifecycle data without an agent target must not reach agents');
  assert.equal(isAgentEventForAgent('ORDER_COMPLETED', { orderId: 'order-a' }, 'agent-a'), false);
  assert.equal(isAgentEventForAgent('AGENT_LOCATION_UPDATED', { agentId: 'agent-a' }, 'agent-a'), false);
  assert.equal(isAgentEventForAgent('UNRELATED_EVENT', { agentId: 'agent-a' }, 'agent-a'), false);
}

async function testStreamCancellationAndAbortCleanup() {
  let currentListener: ((event: RealtimeEvent) => void) | undefined;
  let subscriptions = 0;
  let unsubscriptions = 0;
  const subscribe = (listener: (event: RealtimeEvent) => void) => {
    subscriptions += 1;
    currentListener = listener;
    return () => {
      unsubscriptions += 1;
      currentListener = undefined;
    };
  };

  const abortController = new AbortController();
  const response = createSseResponse({
    signal: abortController.signal,
    subscribe,
    connectedPayload: { status: 'connected' },
    heartbeatIntervalMs: 0,
    onEvent: (event, send) => send(event.event, event.payload),
  });
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /event: connected/);
  assert.equal(subscriptions, 1, 'one stream should create one subscription');

  await reader.cancel();
  assert.equal(unsubscriptions, 1, 'cancel should remove the listener once');
  assert.equal(currentListener, undefined);

  const secondAbortController = new AbortController();
  const secondResponse = createSseResponse({
    signal: secondAbortController.signal,
    subscribe,
    connectedPayload: { status: 'connected' },
    heartbeatIntervalMs: 0,
    onEvent: (event, send) => send(event.event, event.payload),
  });
  const secondReader = secondResponse.body!.getReader();
  await secondReader.read();
  secondAbortController.abort();
  const end = await secondReader.read();
  assert.equal(end.done, true, 'abort should close the stream');
  assert.equal(unsubscriptions, 2, 'abort should remove the listener once');
  assert.equal(currentListener, undefined);

  let raceUnsubscriptions = 0;
  const raceAbort = new AbortController();
  const raceResponse = createSseResponse({
    signal: raceAbort.signal,
    subscribe: () => {
      raceAbort.abort();
      return () => { raceUnsubscriptions += 1; };
    },
    connectedPayload: { status: 'connected' },
    heartbeatIntervalMs: 0,
    onEvent: () => {},
  });
  const raceReader = raceResponse.body!.getReader();
  await raceReader.read();
  assert.equal((await raceReader.read()).done, true, 'abort during subscribe closes the stream');
  assert.equal(raceUnsubscriptions, 1, 'late disposer is called exactly once');

  const failingUnsubscribeAbort = new AbortController();
  const failingUnsubscribeResponse = createSseResponse({
    signal: failingUnsubscribeAbort.signal,
    subscribe: () => () => { throw new Error('unsubscribe failed'); },
    connectedPayload: { status: 'connected' },
    heartbeatIntervalMs: 0,
    onEvent: () => {},
  });
  const failingUnsubscribeReader = failingUnsubscribeResponse.body!.getReader();
  await failingUnsubscribeReader.read();
  failingUnsubscribeAbort.abort();
  assert.equal((await failingUnsubscribeReader.read()).done, true,
    'unsubscribe failure must not prevent stream closure');
}

async function testAsyncEventRejectionIsHandled() {
  const abortController = new AbortController();
  let listener: ((event: RealtimeEvent) => void) | undefined;
  const response = createSseResponse({
    signal: abortController.signal,
    subscribe: (nextListener) => {
      listener = nextListener;
      return () => { listener = undefined; };
    },
    connectedPayload: { status: 'connected' },
    heartbeatIntervalMs: 0,
    onEvent: async () => { throw new Error('async dispatch failed'); },
  });
  const reader = response.body!.getReader();
  await reader.read();
  assert.ok(listener);
  listener!({ event: 'ORDER_UPDATED', payload: { id: 'order-a' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  abortController.abort();
  assert.equal((await reader.read()).done, true);
}

async function testAuthorizationDispatchIsBounded() {
  const authorizationReleases: Array<() => void> = [];
  const dispatched: number[] = [];
  const dispatcher = createBoundedDispatcher<number>(
    2,
    (value) => new Promise<void>((resolve) => {
      dispatched.push(value);
      authorizationReleases.push(resolve);
    }),
    (error) => { throw error; },
  );

  assert.equal(dispatcher(1), true);
  assert.equal(dispatcher(2), true);
  assert.equal(dispatcher(3), false, 'authorization work is rejected at the configured bound');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(dispatched, [1, 2]);
  authorizationReleases.forEach((release) => release());
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(dispatcher(4), true, 'capacity returns when authorization settles');
  await new Promise((resolve) => setTimeout(resolve, 0));
  authorizationReleases[2]();
}

async function run() {
  await testSseHeadersAndFormatting();
  await testCustomerOwnershipAndOrderFiltering();
  await testLocationAssignmentAndLifecycle();
  await testAgentEventTargeting();
  await testStreamCancellationAndAbortCleanup();
  await testAsyncEventRejectionIsHandled();
  await testAuthorizationDispatchIsBounded();
  console.log('SSE stream scenarios passed.');
}

void run();
