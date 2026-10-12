import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as updateLocationRoute } from "../app/api/agent/location/route";
import { signToken } from "../lib/auth/jwt";
import { db } from "../lib/db";
import { broadcaster } from "../lib/realtime";

const agentId = "agent-owned";
const otherAgentId = "agent-other";
const userId = "user-agent";
const orderId = "order-active";

async function run() {
  const agentDelegate = db.agent as any;
  const database = db as any;
  const originalFindUnique = agentDelegate.findUnique;
  const originalTransaction = database.$transaction;
  const broadcasts: Array<{ event: string; payload: any }> = [];
  const unsubscribe = broadcaster.subscribe((event) => broadcasts.push(event));
  const transactionAgentIds: string[] = [];
  const persistedLocations: any[] = [];

  agentDelegate.findUnique = async ({ where }: any) => {
    if (where.id === agentId) return { tokenVersion: 1 };
    if (where.userId === userId) return { id: agentId };
    return null;
  };
  database.$transaction = async (callback: (tx: any) => unknown) => callback({
    order: {
      findFirst: async ({ where }: any) => {
        transactionAgentIds.push(where.agentId);
        if (where.agentId !== agentId || (where.id && where.id !== orderId)) return null;
        return { id: orderId };
      },
    },
    agentLocation: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const created = {
          id: `location-${persistedLocations.length + 1}`,
          timestamp: new Date("2026-10-12T06:00:00.000Z"),
          ...data,
        };
        persistedLocations.push(created);
        return created;
      },
    },
    agent: {
      update: async ({ where, data }: any) => ({
        id: where.id,
        ...data,
        status: "AVAILABLE",
        vehicleNumber: "TEST-AGENT",
        user: { name: "Test Agent" },
      }),
    },
  });

  const request = async (
    payload: Record<string, unknown>,
    token: string | null,
  ) => updateLocationRoute(new NextRequest("http://localhost/api/agent/location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `jio_token=${token}` } : {}),
    },
    body: JSON.stringify(payload),
  }));

  const makeToken = (
    role: "AGENT" | "CUSTOMER" = "AGENT",
    includeAgentId = true,
    expiresInDays = 7,
  ) => signToken({
    userId,
    phone: "test-only",
    role,
    ...(includeAgentId ? { agentId } : {}),
  }, expiresInDays);

  try {
    const normal = await request({
      orderId,
      agentId: otherAgentId,
      lat: 12.9,
      lng: 77.5,
      speed: 2,
    }, makeToken());
    assert.equal(normal.status, 200, "a normal signed agent session can publish a fix");
    assert.equal(transactionAgentIds.at(-1), agentId, "request agentId cannot override the signed agent identity");

    const legacy = await request({ orderId, lat: 12.91, lng: 77.51 }, makeToken("AGENT", false));
    assert.equal(legacy.status, 200, "a legacy session resolves its agent through userId");
    assert.equal(transactionAgentIds.at(-1), agentId);

    assert.equal(persistedLocations.length, 2, "accepted fixes are persisted");
    assert.equal(broadcasts.length, 2, "each new fix broadcasts once");
    for (const message of broadcasts) {
      assert.equal(message.event, "AGENT_LOCATION_UPDATED");
      assert.equal(message.payload.orderId, orderId);
      assert.equal(message.payload.agentId, agentId);
      assert.ok(Number.isFinite(message.payload.lat));
      assert.ok(Number.isFinite(message.payload.lng));
    }

    for (const invalidToken of [null, "not-a-token", makeToken("AGENT", true, -1)]) {
      const response = await request({ orderId, lat: 12.9, lng: 77.5 }, invalidToken);
      assert.equal(response.status, 401, "missing, invalid, and expired sessions are rejected");
    }

    const customerToken = makeToken("CUSTOMER");
    assert.equal((await request({ orderId, agentId, lat: 12.9, lng: 77.5 }, customerToken)).status, 401,
      "a customer session cannot write agent locations");

    for (const coordinates of [
      { lng: 77.5 },
      { lat: 91, lng: 77.5 },
      { lat: 12.9, lng: 181 },
      { lat: Number.NaN, lng: 77.5 },
    ]) {
      const response = await request({ orderId, ...coordinates }, makeToken());
      assert.equal(response.status, 400, "missing and out-of-range coordinates are rejected");
    }
  } finally {
    unsubscribe();
    agentDelegate.findUnique = originalFindUnique;
    database.$transaction = originalTransaction;
  }
}

void run().then(() => console.log("Agent location route scenarios passed."));
