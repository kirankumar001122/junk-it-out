import assert from 'node:assert/strict';
import { db } from '../lib/db';
import {
  createOrder,
  createOrderPayloadHash,
  OrderIdempotencyConflictError,
} from '../lib/services/orderService';

async function runTests() {
  console.log('--- RUNNING BOOKING IDEMPOTENCY & PAYLOAD INTEGRITY TEST SUITE ---');

  const baseInput = {
    phone: '9876543210',
    name: 'Idempotency Test Customer',
    address: {
      houseNo: 'Flat 402, Green Heights',
      street: '14th Main Road',
      area: 'JP Nagar',
      pincode: '560078',
      lat: 12.9077,
      lng: 77.5854,
    },
    items: [
      { categoryId: 'cat_ewaste_01', estimatedWeight: 5 },
    ],
    pickupType: 'ASAP' as const,
    scheduledSlot: null,
    notes: 'Gate code 402',
    financialDirection: 'CUSTOMER_PAYS' as const,
  };

  const authUser = {
    userId: 'user_idem_test',
    customerId: 'cust_idem_test',
  };

  // 1. Verify payload hash helper produces stable hashes for identical payloads
  const hash1 = createOrderPayloadHash(baseInput);
  const hash2 = createOrderPayloadHash({
    ...baseInput,
    items: [{ categoryId: 'cat_ewaste_01', estimatedWeight: 5 }],
  });
  assert.equal(hash1, hash2, 'Identical payloads must produce identical payload hashes');

  // Verify altering an item weight changes the payload hash
  const alteredWeightHash = createOrderPayloadHash({
    ...baseInput,
    items: [{ categoryId: 'cat_ewaste_01', estimatedWeight: 10 }],
  });
  assert.notEqual(hash1, alteredWeightHash, 'Altering item weight must change payload hash');

  // Verify altering instructions changes the payload hash
  const alteredNotesHash = createOrderPayloadHash({
    ...baseInput,
    notes: 'Please call before arriving',
  });
  assert.notEqual(hash1, alteredNotesHash, 'Altering notes must change payload hash');

  // Verify altering time slot changes the payload hash
  const alteredSlotHash = createOrderPayloadHash({
    ...baseInput,
    pickupType: 'SCHEDULED' as const,
    scheduledSlot: 'Tomorrow, 10:00 AM - 11:00 AM',
  });
  assert.notEqual(hash1, alteredSlotHash, 'Altering pickup slot must change payload hash');

  // Verify applying or altering coupon changes the payload hash
  const couponHash = createOrderPayloadHash({
    ...baseInput,
    couponCode: 'WELCOME50',
  });
  assert.notEqual(hash1, couponHash, 'Applying coupon code must change payload hash');

  const couponCaseHash = createOrderPayloadHash({
    ...baseInput,
    couponCode: 'welcome50',
  });
  assert.equal(couponHash, couponCaseHash, 'Coupon code canonicalization must be case-insensitive');

  const differentCouponHash = createOrderPayloadHash({
    ...baseInput,
    couponCode: 'SOUTHBLR20',
  });
  assert.notEqual(couponHash, differentCouponHash, 'Different coupon code must change payload hash');

  console.log('✓ Payload hash sensitivity tests passed');

  // Mock DB dependencies for createOrder
  const originalUserFindUnique = (db as any).user.findUnique;
  const originalServiceAreaFindMany = (db as any).serviceArea.findMany;
  const originalAddressUpdateMany = (db as any).address.updateMany;
  const originalAddressCreate = (db as any).address.create;
  const originalWasteCategoryFindMany = (db as any).wasteCategory.findMany;
  const originalCouponFindUnique = (db as any).coupon.findUnique;
  const originalOrderFindFirst = (db as any).order.findFirst;
  const originalTransaction = (db as any).$transaction;

  let orderCounter = 1;
  const createdOrders: any[] = [];

  (db as any).user.findUnique = async () => ({
    id: authUser.userId,
    customer: { id: authUser.customerId },
    role: 'CUSTOMER',
  });

  (db as any).serviceArea.findMany = async () => [
    {
      id: 'area_jp_nagar',
      name: 'JP Nagar',
      status: 'ACTIVE',
      boundaryPolygon: '[[12.9,77.5],[13.0,77.5],[13.0,77.6],[12.9,77.6]]',
      etaMinutes: 25,
      basePickupCharge: 49,
    },
  ];

  (db as any).address.updateMany = async () => ({ count: 0 });
  (db as any).address.create = async () => ({ id: 'addr_test_01' });
  (db as any).wasteCategory.findMany = async () => [
    { id: 'cat_ewaste_01', name: 'E-Waste', pricePerKg: 15, active: true },
    { id: 'cat_plastic_02', name: 'Plastic Waste', pricePerKg: 10, active: true },
  ];
  (db as any).coupon.findUnique = async () => null;
  (db as any).order.findFirst = async () => null;

  (db as any).$transaction = async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      order: {
        create: async ({ data }: any) => {
          const order = {
            id: `ord_test_${orderCounter++}`,
            orderNumber: `JIO-TEST-${orderCounter}`,
            status: data.status,
            paymentStatus: data.paymentStatus || 'PENDING',
            finalAmount: data.finalAmount || 124,
            customer: { user: { id: authUser.userId } },
            address: { id: 'addr_test_01', area: 'JP Nagar' },
            items: data.items?.create || [],
            statusHistory: [{ newStatus: data.status }],
          };
          createdOrders.push(order);
          return order;
        },
      },
    };
    return callback(tx);
  };

  try {
    // TEST 1: Initial Booking Order Creation with Key
    const key1 = `test_key_${Date.now()}`;
    const order1 = await createOrder(baseInput, key1, authUser);
    assert.ok(order1?.id, 'First order must be created');
    assert.equal(createdOrders.length, 1, 'Exactly one order should exist');

    // TEST 2: Exact Retry (Unchanged Booking details, e.g. after transient payment close)
    // Server must return existing order without creating a duplicate order
    const retryOrder = await createOrder(baseInput, key1, authUser);
    assert.equal(retryOrder.id, order1.id, 'Retry with exact same payload must return original order');
    assert.equal(createdOrders.length, 1, 'Retry must NOT create a duplicate order in DB');
    console.log('✓ Unchanged booking retry idempotency test passed (no duplicate order created)');

    // TEST 3: Attempting to reuse the same idempotency key for an altered payload must fail
    // Server must reject with OrderIdempotencyConflictError
    const editedInput = {
      ...baseInput,
      items: [
        { categoryId: 'cat_ewaste_01', estimatedWeight: 10 }, // edited weight
      ],
    };

    await assert.rejects(
      async () => {
        await createOrder(editedInput, key1, authUser);
      },
      (err: any) => {
        assert.ok(
          err instanceof OrderIdempotencyConflictError || err.name === 'OrderIdempotencyConflictError',
          'Must throw OrderIdempotencyConflictError when reusing key for changed payload'
        );
        return true;
      },
      'Server must reject reusing an idempotency key for an altered booking payload'
    );
    assert.equal(createdOrders.length, 1, 'Conflict attempt must not create an order');
    console.log('✓ Reusing idempotency key for altered payload was safely rejected with OrderIdempotencyConflictError');

    // TEST 4: Editing booking details with a fresh idempotency key creates the new order successfully
    const key2 = `test_key_edited_${Date.now()}`;
    const order2 = await createOrder(editedInput, key2, authUser);
    assert.ok(order2?.id, 'Order with edited details and new key must be created');
    assert.notEqual(order2.id, order1.id, 'Edited order must be a separate order');
    assert.equal(createdOrders.length, 2, 'Two distinct orders should now exist');
    console.log('✓ Edited booking with new idempotency key successfully created distinct order');

    // TEST 5: Verify changing instructions with a new key creates a distinct order
    const key3 = `test_key_notes_${Date.now()}`;
    const notesInput = {
      ...baseInput,
      notes: 'Call 9876543210 on arrival at gate',
    };
    const order3 = await createOrder(notesInput, key3, authUser);
    assert.ok(order3?.id, 'Order with updated notes and new key must be created');
    assert.equal(createdOrders.length, 3, 'Three distinct orders should now exist');
    console.log('✓ Notes update with new idempotency key created distinct order');

    console.log('\nALL BOOKING IDEMPOTENCY AND PAYLOAD INTEGRITY TESTS PASSED SUCCESSFULLY.');
  } finally {
    (db as any).user.findUnique = originalUserFindUnique;
    (db as any).serviceArea.findMany = originalServiceAreaFindMany;
    (db as any).address.updateMany = originalAddressUpdateMany;
    (db as any).address.create = originalAddressCreate;
    (db as any).wasteCategory.findMany = originalWasteCategoryFindMany;
    (db as any).coupon.findUnique = originalCouponFindUnique;
    (db as any).order.findFirst = originalOrderFindFirst;
    (db as any).$transaction = originalTransaction;
  }
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
