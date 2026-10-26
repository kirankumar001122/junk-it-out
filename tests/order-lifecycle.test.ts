import assert from "node:assert/strict";
import { db } from "../lib/db";
import {
  InvalidOrderTransitionError,
  transitionOrder,
} from "../lib/services/orderLifecycle";

let order = { id: "lifecycle-order", status: "BOOKING_RECEIVED", agentId: null as string | null };
let history: unknown[] = [];
let failHistoryCreate = false;
let transactionQueue = Promise.resolve();

const originalTransaction = (db as any).$transaction;
(db as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => {
  let release!: () => void;
  const previous = transactionQueue;
  transactionQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;

  let transactionOrder = { ...order };
  const transactionHistory = [...history];
  const tx = {
    order: {
      updateMany: async ({ where, data }: any) => {
        if (
          transactionOrder.id !== where.id ||
          transactionOrder.status !== where.status ||
          (where.agentId !== undefined && transactionOrder.agentId !== where.agentId)
        ) return { count: 0 };
        transactionOrder = { ...transactionOrder, ...data };
        return { count: 1 };
      },
      findUnique: async () => ({ ...transactionOrder }),
    },
    orderStatusHistory: {
      create: async ({ data }: any) => {
        if (failHistoryCreate) throw new Error("simulated history failure");
        transactionHistory.push(data);
      },
    },
  };

  try {
    const result = await callback(tx);
    order = transactionOrder;
    history = transactionHistory;
    return result;
  } finally {
    release();
  }
};

async function reset(status = "BOOKING_RECEIVED") {
  order = { id: "lifecycle-order", status, agentId: null };
  history = [];
  failHistoryCreate = false;
  await transactionQueue;
}

async function run() {
  try {
    await reset();
    const options = {
      orderId: order.id,
      expectedStatus: "BOOKING_RECEIVED",
      expectedAgentId: null,
      newStatus: "AGENT_ASSIGNED",
      notes: "isolated transition",
    };
    const concurrent = await Promise.all([
      transitionOrder(options),
      transitionOrder(options),
    ]);
    assert.deepEqual(concurrent.map((result) => result.changed).sort(), [false, true]);
    assert.equal(order.status, "AGENT_ASSIGNED");
    assert.equal(history.length, 1, "only the winning transition writes history");

    await reset("AGENT_BEING_ASSIGNED");
    const accepted = await transitionOrder({
      ...options,
      expectedStatus: "AGENT_BEING_ASSIGNED",
      newStatus: "AGENT_ACCEPTED",
    });
    assert.equal(accepted.changed, true, "agent acceptance preserves the existing dispatch transition");

    await assert.rejects(
      transitionOrder({
        ...options,
        expectedStatus: "CANCELLED",
        newStatus: "AGENT_ACCEPTED",
      }),
      InvalidOrderTransitionError,
    );
    assert.equal(history.length, 1, "invalid transition adds no history");

    await reset();
    failHistoryCreate = true;
    await assert.rejects(transitionOrder(options), /simulated history failure/);
    assert.equal(order.status, "BOOKING_RECEIVED", "transaction failure rolls back order status");
    assert.equal(history.length, 0, "transaction failure rolls back history");

    failHistoryCreate = false;
    await assert.rejects(
      transitionOrder({
        ...options,
        afterHistory: async () => { throw new Error("simulated agent update failure"); },
      }),
      /simulated agent update failure/,
    );
    assert.equal(order.status, "BOOKING_RECEIVED", "related agent failure rolls back the transition");
    assert.equal(history.length, 0, "related agent failure rolls back history");

    console.log("Order lifecycle concurrency, duplicate, invalid-state, and rollback tests passed.");
  } finally {
    (db as any).$transaction = originalTransaction;
    await db.$disconnect();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
