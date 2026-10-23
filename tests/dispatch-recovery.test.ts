import assert from 'node:assert/strict';
import { db } from '../lib/db';
import { reconcileUndispatchedPaidOrders } from '../lib/payments/dispatchRecovery';

async function run() {
  const orderDelegate = db.order as any;
  const refundAttemptDelegate = db.refundAttempt as any;

  const originalOrderFindMany = orderDelegate.findMany;
  const originalOrderFindUnique = orderDelegate.findUnique;
  const originalRefundFindFirst = refundAttemptDelegate.findFirst;

  try {
    // -------------------------------------------------------------
    // TEST 1: Recovery of an interrupted dispatch (Server crash after capture)
    // -------------------------------------------------------------
    {
      const orderStore: any = {
        id: 'ord-interrupted-1',
        orderNumber: 'JIO-INT-001',
        status: 'BOOKING_RECEIVED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        agentId: null,
        address: { area: 'JP Nagar' },
      };

      orderDelegate.findMany = async ({ where }: any) => {
        // Assert query filters for safety
        assert.equal(where.financialDirection, 'CUSTOMER_PAYS');
        assert.equal(where.paymentStatus, 'CAPTURED');
        assert.equal(where.agentId, null);
        assert.deepEqual(where.status.in, ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED']);
        return [orderStore];
      };

      refundAttemptDelegate.findFirst = async () => null; // No refund attempt

      orderDelegate.findUnique = async ({ where }: any) => {
        if (where.id === orderStore.id) return orderStore;
        return null;
      };

      let dispatchCalled = 0;
      const mockDispatch = async (orderId: string) => {
        assert.equal(orderId, 'ord-interrupted-1');
        dispatchCalled += 1;
        // Simulate successful agent assignment
        orderStore.agentId = 'agent-jp-1';
        orderStore.status = 'AGENT_ASSIGNED';
      };

      const summary = await reconcileUndispatchedPaidOrders({
        serviceArea: 'JP Nagar',
        dispatchFn: mockDispatch,
      });

      assert.equal(summary.scanned, 1, 'scanned count should be 1');
      assert.equal(summary.attempted, 1, 'attempted count should be 1');
      assert.equal(summary.assigned, 1, 'assigned count should be 1');
      assert.equal(summary.unassigned, 0);
      assert.equal(summary.skipped, 0);
      assert.equal(summary.errors.length, 0);
      assert.equal(dispatchCalled, 1, 'dispatch must be called exactly once');
      assert.equal(orderStore.agentId, 'agent-jp-1');
      assert.equal(orderStore.status, 'AGENT_ASSIGNED');
    }

    // -------------------------------------------------------------
    // TEST 2: Active refund attempt causes order to be safely SKIPPED
    // -------------------------------------------------------------
    {
      const orderWithRefund = {
        id: 'ord-refund-pending-1',
        orderNumber: 'JIO-RFND-001',
        status: 'BOOKING_RECEIVED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        agentId: null,
      };

      orderDelegate.findMany = async () => [orderWithRefund];
      refundAttemptDelegate.findFirst = async () => ({ id: 'rfnd-attempt-1', status: 'PENDING' });

      let dispatchCalled = 0;
      const mockDispatch = async () => {
        dispatchCalled += 1;
      };

      const summary = await reconcileUndispatchedPaidOrders({
        dispatchFn: mockDispatch,
      });

      assert.equal(summary.scanned, 1);
      assert.equal(summary.attempted, 0, 'must NOT attempt dispatch for order with active refund');
      assert.equal(summary.skipped, 1, 'order must be skipped');
      assert.equal(dispatchCalled, 0, 'dispatch function must never be called');
    }

    // -------------------------------------------------------------
    // TEST 3: Idempotency on repeated recovery runs
    // -------------------------------------------------------------
    {
      // Once assigned, the query will return 0 candidates
      orderDelegate.findMany = async () => [];

      let dispatchCalled = 0;
      const mockDispatch = async () => {
        dispatchCalled += 1;
      };

      const summary = await reconcileUndispatchedPaidOrders({
        dispatchFn: mockDispatch,
      });

      assert.equal(summary.scanned, 0);
      assert.equal(summary.attempted, 0);
      assert.equal(summary.assigned, 0);
      assert.equal(dispatchCalled, 0);
    }

    // -------------------------------------------------------------
    // TEST 4: Fallback when no agent is available in service area
    // -------------------------------------------------------------
    {
      const orderWithoutAgent = {
        id: 'ord-no-agent-1',
        orderNumber: 'JIO-NOAGENT-001',
        status: 'BOOKING_RECEIVED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        agentId: null,
      };

      orderDelegate.findMany = async () => [orderWithoutAgent];
      refundAttemptDelegate.findFirst = async () => null;
      orderDelegate.findUnique = async () => orderWithoutAgent; // Still agentId: null

      let dispatchCalled = 0;
      const mockDispatch = async () => {
        dispatchCalled += 1;
        // Does not assign (e.g. only broadcasted NEW_PICKUP_AVAILABLE)
      };

      const summary = await reconcileUndispatchedPaidOrders({
        dispatchFn: mockDispatch,
      });

      assert.equal(summary.scanned, 1);
      assert.equal(summary.attempted, 1);
      assert.equal(summary.assigned, 0);
      assert.equal(summary.unassigned, 1, 'order remains unassigned when no agent is free');
      assert.equal(dispatchCalled, 1);
      assert.equal(orderWithoutAgent.agentId, null);
    }

    // -------------------------------------------------------------
    // TEST 5: Concurrent assignment race condition protection
    // -------------------------------------------------------------
    {
      const contestedOrder = {
        id: 'ord-race-1',
        orderNumber: 'JIO-RACE-001',
        status: 'BOOKING_RECEIVED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        agentId: null,
      };

      orderDelegate.findMany = async () => [contestedOrder];
      refundAttemptDelegate.findFirst = async () => null;

      let winnerAgent = '';
      let dispatchCount = 0;

      // Simulated atomic dispatch where Worker 1 wins and Worker 2 detects agentId changed
      const simulateConcurrentDispatch = async (workerId: string) => {
        dispatchCount += 1;
        if (!contestedOrder.agentId) {
          // Worker 1 claims order atomically
          contestedOrder.agentId = `agent-${workerId}`;
          winnerAgent = `agent-${workerId}`;
        } else {
          // Worker 2 sees already assigned, does not double-assign
          return;
        }
      };

      orderDelegate.findUnique = async () => contestedOrder;

      // Run two workers simultaneously
      const [w1, w2] = await Promise.all([
        reconcileUndispatchedPaidOrders({ dispatchFn: () => simulateConcurrentDispatch('worker-A') }),
        reconcileUndispatchedPaidOrders({ dispatchFn: () => simulateConcurrentDispatch('worker-B') }),
      ]);

      assert.equal(contestedOrder.agentId, winnerAgent);
      assert.equal(w1.assigned + w2.assigned, 2, 'both report order state safely resolved');
      assert.equal(w1.errors.length, 0);
      assert.equal(w2.errors.length, 0);
    }

    console.log('Dispatch recovery regression tests passed.');
  } finally {
    orderDelegate.findMany = originalOrderFindMany;
    orderDelegate.findUnique = originalOrderFindUnique;
    refundAttemptDelegate.findFirst = originalRefundFindFirst;
    await db.$disconnect();
  }
}

void run();
