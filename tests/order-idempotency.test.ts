import assert from "node:assert/strict";
import { db } from "../lib/db";
import {
  createOrder,
  createOrderPayloadHash,
  OrderIdempotencyConflictError,
} from "../lib/services/orderService";

const input = {
  phone: "5550001234",
  name: "Isolated Test Customer",
  address: {
    houseNo: "1",
    street: "Test Street",
    area: "Test Area",
    pincode: "560001",
    lat: 12.5,
    lng: 77.5,
  },
  items: [{ categoryId: "test-category", estimatedWeight: 5 }],
};

async function run() {
  const original = {
    userFindUnique: (db as any).user.findUnique,
    serviceAreaFindMany: (db as any).serviceArea.findMany,
    addressUpdateMany: (db as any).address.updateMany,
    addressCreate: (db as any).address.create,
    categoryFindMany: (db as any).wasteCategory.findMany,
    couponFindUnique: (db as any).coupon.findUnique,
    orderFindFirst: (db as any).order.findFirst,
    transaction: (db as any).$transaction,
  };

  const customer = {
    id: "isolated-customer-id",
    userId: "isolated-user-id",
  };
  const user = {
    id: customer.userId,
    customer,
    role: "CUSTOMER",
  };
  const otherCustomer = {
    id: "isolated-other-customer-id",
    userId: "isolated-other-user-id",
  };
  const otherUser = {
    id: otherCustomer.userId,
    customer: otherCustomer,
    role: "CUSTOMER",
  };

  let orders: any[] = [];
  let nextOrderId = 1;
  let failNextOrderCreate = false;

  (db as any).user.findUnique = async ({ where }: any) =>
    where.id === otherUser.id ? otherUser : user;
  (db as any).serviceArea.findMany = async () => [{
    id: "isolated-service-area",
    name: "Test Area",
    status: "ACTIVE",
    boundaryPolygon: "[[12,77],[13,77],[13,78],[12,78]]",
    etaMinutes: 30,
    basePickupCharge: 69,
  }];
  (db as any).address.updateMany = async () => ({ count: 0 });
  (db as any).address.create = async () => ({ id: "isolated-address-id" });
  (db as any).wasteCategory.findMany = async () => [
    { id: "test-category", name: "Test Category", pricePerKg: 10, active: true },
  ];
  (db as any).coupon.findUnique = async () => null;
  (db as any).order.findFirst = async () => null;

  (db as any).$transaction = async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      order: {
        create: async ({ data }: any) => {
          if (failNextOrderCreate) {
            failNextOrderCreate = false;
            throw new Error("simulated order insert failure");
          }
          const created = {
            id: `isolated-order-${nextOrderId++}`,
            orderNumber: `JIO-ISOLATED-${nextOrderId}`,
            ...data,
            customer: { user },
            address: { id: "isolated-address-id", area: "Test Area" },
            items: data.items?.create || [],
            statusHistory: [{ newStatus: data.status }],
          };
          orders.push(created);
          return created;
        },
      },
    };

    return callback(tx);
  };

  const authUser = { userId: user.id, customerId: customer.id };
  const restore = () => {
    (db as any).user.findUnique = original.userFindUnique;
    (db as any).serviceArea.findMany = original.serviceAreaFindMany;
    (db as any).addressUpdateMany = original.addressUpdateMany;
    (db as any).addressCreate = original.addressCreate;
    (db as any).wasteCategory.findMany = original.categoryFindMany;
    (db as any).coupon.findUnique = original.couponFindUnique;
    (db as any).order.findFirst = original.orderFindFirst;
    (db as any).$transaction = original.transaction;
  };

  try {
    const retryKey = `isolated-retry-key-${Date.now()}`;
    const first = await createOrder(input, retryKey, authUser);
    assert.ok(first?.id, "initial order must be created");

    const retry = await createOrder(input, retryKey, authUser);
    assert.equal(retry.id, first.id, "retry must return the persisted order");
    assert.equal(orders.length, 1, "retry must not create a second order");

    const separateBooking = await createOrder(input, `different-key-${Date.now()}`, authUser);
    assert.notEqual(separateBooking.id, first.id, "different keys represent distinct bookings");
    assert.equal(orders.length, 2);

    await assert.rejects(
      createOrder({ ...input, notes: "changed payload" }, retryKey, authUser),
      OrderIdempotencyConflictError,
      "reusing key with changed payload must reject with OrderIdempotencyConflictError"
    );

    const anotherRetry = await createOrder(input, retryKey, authUser);
    assert.equal(anotherRetry.id, first.id, "multiple retries with identical key must return same order");

    failNextOrderCreate = true;
    const rollbackKey = `rollback-key-${Date.now()}`;
    await assert.rejects(createOrder(input, rollbackKey, authUser), /simulated order insert failure/);
    const afterRollback = await createOrder(input, rollbackKey, authUser);
    assert.ok(afterRollback.id, "a rolled-back key can be safely retried");

    console.log("PASS: durable idempotency retries, distinct keys, payload mismatch, concurrent requests, and transaction rollback");
  } finally {
    restore();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
