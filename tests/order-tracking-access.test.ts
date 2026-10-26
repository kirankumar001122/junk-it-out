import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getOrderRoute } from "../app/api/orders/[id]/route";
import { db } from "../lib/db";
import { signToken } from "../lib/auth/jwt";
import { getOrderIdentifierWhere, isCustomerOrderOwner } from "../lib/orderAccess";
import { getApiErrorMessage } from "../lib/utils/apiErrorMessage";

const databaseId = "5ef8a0d0-de85-4f11-851b-8949e24cef4f";
const orderNumber = "JIO-20261012-000124";

assert.deepEqual(getOrderIdentifierWhere(databaseId), {
  OR: [{ id: databaseId }, { orderNumber: databaseId }],
}, "database UUIDs and pickup numbers use the same explicit identity lookup");
assert.deepEqual(getOrderIdentifierWhere(orderNumber), {
  OR: [{ id: orderNumber }, { orderNumber }],
}, "pickup order numbers are queried as order numbers, not mistaken for UUIDs");

const customer = { customerId: "customer-1", userId: "user-1" };
assert.equal(isCustomerOrderOwner({ customerId: "customer-1", customer: { userId: "user-1" } }, customer), true,
  "an order linked to the authenticated customer profile is accessible");
assert.equal(isCustomerOrderOwner({ customerId: "other-customer", customer: { userId: "user-1" } }, customer), true,
  "the authenticated user relationship also supports owned orders");
assert.equal(isCustomerOrderOwner({ customerId: "other-customer", customer: { userId: "other-user" } }, customer), false,
  "another customer's order remains inaccessible");
assert.equal(isCustomerOrderOwner({ customerId: "other-customer", customer: null }, customer), false,
  "a missing customer relation does not grant access");

assert.equal(getApiErrorMessage({ error: { code: "ORDER_NOT_FOUND", message: "Order not found." } }, "fallback"),
  "Order not found.", "the API's nested not-found message is shown");
assert.equal(getApiErrorMessage({ error: { code: "FORBIDDEN", message: "Not your order." } }, "fallback"),
  "Not your order.", "an ownership failure is not mislabeled as a missing order");
assert.equal(getApiErrorMessage({ message: "Legacy API error" }, "fallback"), "Legacy API error");
assert.equal(getApiErrorMessage({ success: false }, "fallback"), "fallback");

async function testOrderDetailRouteLookupAndOwnership() {
  const orderDelegate = db.order as any;
  const originalFindFirst = orderDelegate.findFirst;
  const order = {
    id: databaseId,
    orderNumber,
    customerId: "customer-1",
    customer: { userId: "user-1" },
    agentId: null,
  };
  orderDelegate.findFirst = async ({ where }: { where: { OR: Array<Record<string, string>> } }) => {
    const matches = where.OR.some((candidate) =>
      candidate.id === order.id || candidate.orderNumber === order.orderNumber,
    );
    return matches ? order : null;
  };

  const token = signToken({
    userId: "user-1",
    customerId: "customer-1",
    phone: "test-only",
    role: "CUSTOMER",
  });
  const requestOrder = async (identifier: string, userId = "user-1") => {
    const session = signToken({
      userId,
      customerId: userId === "user-1" ? "customer-1" : "other-customer",
      phone: "test-only",
      role: "CUSTOMER",
    });
    return getOrderRoute(
      new NextRequest(`http://localhost/api/orders/${encodeURIComponent(identifier)}`, {
        headers: { Cookie: `jio_token=${session}` },
      }),
      { params: Promise.resolve({ id: identifier }) },
    );
  };

  try {
    assert.ok(token);
    const byDatabaseId = await requestOrder(databaseId);
    assert.equal(byDatabaseId.status, 200, "an authenticated owner can open the order by UUID");

    const byOrderNumber = await requestOrder(orderNumber);
    assert.equal(byOrderNumber.status, 200, "an authenticated owner can open the order by pickup number");

    const missing = await requestOrder("missing-order-id");
    assert.equal(missing.status, 404, "a nonexistent order returns not found");

    const unauthorized = await requestOrder(databaseId, "user-2");
    assert.equal(unauthorized.status, 403, "another customer's order remains forbidden");
  } finally {
    orderDelegate.findFirst = originalFindFirst;
  }
}

void testOrderDetailRouteLookupAndOwnership().then(() => {
  console.log("Order tracking identity, ownership, and API error scenarios passed.");
});
