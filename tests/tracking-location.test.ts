import assert from "node:assert/strict";
import {
  getAgentLocationLabel,
  isTerminalOrderStatus,
  parseAgentLocation,
} from "../lib/trackingLocation";

const now = Date.parse("2026-10-12T06:00:00.000Z");
const fresh = parseAgentLocation({
  orderId: "order-1",
  agentId: "agent-1",
  lat: 12.9,
  lng: 77.5,
  timestamp: new Date(now).toISOString(),
}, "order-1", "agent-1", "poll");

assert.ok(fresh, "a valid persisted coordinate is accepted");
assert.equal(parseAgentLocation({ orderId: "order-2", agentId: "agent-1", lat: 12, lng: 77, timestamp: now },
  "order-1", "agent-1", "sse"), null, "a location for another order is rejected");
assert.equal(parseAgentLocation({ orderId: "order-1", agentId: "agent-2", lat: 12, lng: 77, timestamp: now },
  "order-1", "agent-1", "sse"), null, "a location from a non-assigned agent is rejected");
assert.equal(parseAgentLocation({ orderId: "order-1", agentId: "agent-1", lat: 91, lng: 77, timestamp: now },
  "order-1", "agent-1", "sse"), null, "out-of-range coordinates are rejected");
assert.equal(parseAgentLocation({ orderId: "order-1", agentId: "agent-1", lat: 12, lng: 77, timestamp: "bad" },
  "order-1", "agent-1", "sse"), null, "invalid timestamps are rejected");

assert.equal(isTerminalOrderStatus("PICKUP_COMPLETED"), true);
assert.equal(isTerminalOrderStatus("SETTLEMENT_COMPLETED"), true);
assert.equal(isTerminalOrderStatus("CANCELLED"), true);
assert.equal(isTerminalOrderStatus("WEIGHING"), false);
assert.equal(getAgentLocationLabel("AGENT_ON_WAY", fresh, now, 30_000), "Live");
assert.equal(getAgentLocationLabel("AGENT_ON_WAY", fresh, now + 31_000, 30_000), "Location unavailable");
assert.equal(getAgentLocationLabel("PICKUP_COMPLETED", fresh, now + 31_000, 30_000), "Last known location",
  "terminal orders identify saved coordinates as historical, never live");
assert.equal(getAgentLocationLabel("PICKUP_COMPLETED", null, now, 30_000), "Location unavailable");

console.log("Customer tracking location scenarios passed.");
