export type AgentLocationSnapshot = {
  orderId: string;
  agentId: string;
  lat: number;
  lng: number;
  updatedAt: number;
  source: "sse" | "poll";
};

const ACTIVE_TRACKING_STATUSES = new Set([
  "AGENT_ASSIGNED",
  "AGENT_ACCEPTED",
  "AGENT_ON_WAY",
  "AGENT_ARRIVED",
  "WASTE_VERIFICATION",
  "WEIGHING",
]);

const TERMINAL_ORDER_STATUSES = new Set([
  "PICKUP_COMPLETED",
  "SETTLEMENT_COMPLETED",
  "CANCELLED",
]);

export function parseAgentLocation(
  value: unknown,
  expectedOrderId: string,
  expectedAgentId: string,
  source: AgentLocationSnapshot["source"],
): AgentLocationSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const location = value as Record<string, unknown>;
  if (
    String(location.orderId ?? "") !== expectedOrderId ||
    String(location.agentId ?? "") !== expectedAgentId
  ) {
    return null;
  }

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  const updatedAt = location.timestamp instanceof Date
    ? location.timestamp.getTime()
    : new Date(location.timestamp as string | number).getTime();
  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180 ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }

  return { orderId: expectedOrderId, agentId: expectedAgentId, lat, lng, updatedAt, source };
}

export function isActiveTrackingStatus(status: string | null | undefined) {
  return typeof status === "string" && ACTIVE_TRACKING_STATUSES.has(status);
}

export function isTerminalOrderStatus(status: string | null | undefined) {
  return typeof status === "string" && TERMINAL_ORDER_STATUSES.has(status);
}

export function getAgentLocationLabel(
  status: string,
  location: AgentLocationSnapshot | null,
  now: number,
  staleAfterMs: number,
) {
  if (!location) return "Location unavailable";
  if (isTerminalOrderStatus(status)) return "Last known location";
  if (!isActiveTrackingStatus(status) || now - location.updatedAt > staleAfterMs) {
    return "Location unavailable";
  }
  return "Live";
}
