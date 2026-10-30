import type { RealtimeEvent } from "./sse";

const CUSTOMER_ORDER_EVENTS = new Set([
  "ORDER_UPDATED",
  "ORDER_ASSIGNED",
  "ORDER_ACCEPTED",
  "AGENT_ASSIGNED",
  "AGENT_STARTED",
  "AGENT_ARRIVED",
  "WEIGHING_STARTED",
  "ORDER_COMPLETED",
]);

const AGENT_ORDER_EVENTS = new Set([
  "ORDER_UPDATED",
  "ORDER_ACCEPTED",
  "ORDER_ASSIGNED",
  "AGENT_ASSIGNED",
  "AGENT_STARTED",
  "AGENT_ARRIVED",
  "WEIGHING_STARTED",
  "ORDER_COMPLETED",
]);

const ACTIVE_TRACKING_STATUSES = new Set([
  "AGENT_ASSIGNED",
  "AGENT_ACCEPTED",
  "AGENT_ON_WAY",
  "AGENT_ARRIVED",
  "WASTE_VERIFICATION",
  "WEIGHING",
]);

const EVENT_STATUS: Record<string, string> = {
  ORDER_ASSIGNED: "AGENT_ASSIGNED",
  ORDER_ACCEPTED: "AGENT_ACCEPTED",
  AGENT_STARTED: "AGENT_ON_WAY",
  AGENT_ARRIVED: "AGENT_ARRIVED",
  WEIGHING_STARTED: "WEIGHING",
  ORDER_COMPLETED: "PICKUP_COMPLETED",
};

export type CustomerTrackingState = {
  trackedOrderId: string | null;
  assignedAgentId: string | null;
  orderStatus: string | null;
};

export function createBoundedDispatcher<T>(
  maxPending: number,
  dispatch: (value: T) => void | Promise<void>,
  onError: (error: unknown) => void,
) {
  let pending = 0;
  return (value: T) => {
    if (pending >= maxPending) return false;
    pending += 1;
    void Promise.resolve()
      .then(() => dispatch(value))
      .catch(onError)
      .finally(() => {
        pending -= 1;
      });
    return true;
  };
}

export const sameEventId = (left: unknown, right: unknown) =>
  left != null && right != null && String(left) === String(right);

export function getCustomerEventOrderId(event: string, payload: any): string | null {
  if (!CUSTOMER_ORDER_EVENTS.has(event) && event !== "AGENT_LOCATION_UPDATED") {
    return null;
  }

  // ORDER_UPDATED is broadcast with the full Order record, whose `id` field
  // is its database ID. Other events use an explicit `orderId` contract.
  const candidate = event === "ORDER_UPDATED" ? payload?.id : payload?.orderId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

export function isActiveTrackingStatus(status: string | null | undefined) {
  return typeof status === "string" && ACTIVE_TRACKING_STATUSES.has(status);
}

export function isAgentEventForAgent(event: string, payload: any, agentId: string) {
  if (event === "NEW_PICKUP_AVAILABLE") {
    return Array.isArray(payload?.targetAgentIds) &&
      payload.targetAgentIds.some((id: unknown) => sameEventId(id, agentId));
  }

  if (!AGENT_ORDER_EVENTS.has(event)) return false;
  // Every targeted order event must identify its assigned agent. Missing IDs
  // are dropped rather than broadcasting order/customer data to all agents.
  return sameEventId(payload?.agentId, agentId);
}

export function shouldForwardCustomerEvent(
  event: RealtimeEvent,
  state: CustomerTrackingState,
  isOwnedOrder: (orderId: string) => boolean,
): boolean;
export function shouldForwardCustomerEvent(
  event: RealtimeEvent,
  state: CustomerTrackingState,
  isOwnedOrder: (orderId: string) => Promise<boolean>,
): Promise<boolean>;
export function shouldForwardCustomerEvent(
  event: RealtimeEvent,
  state: CustomerTrackingState,
  isOwnedOrder: (orderId: string) => boolean | Promise<boolean>,
): boolean | Promise<boolean>;
export function shouldForwardCustomerEvent(
  event: RealtimeEvent,
  state: CustomerTrackingState,
  isOwnedOrder: (orderId: string) => boolean | Promise<boolean>,
): boolean | Promise<boolean> {
  const payload = event.payload as any;
  const orderId = getCustomerEventOrderId(event.event, payload);
  if (!orderId) return false;

  if (state.trackedOrderId && !sameEventId(orderId, state.trackedOrderId)) {
    return false;
  }

  const finishAuthorization = (owned: boolean) => {
    if (!owned) return false;

    if (event.event === "AGENT_LOCATION_UPDATED") {
      return Boolean(
        state.trackedOrderId &&
          sameEventId(orderId, state.trackedOrderId) &&
          sameEventId(payload?.agentId, state.assignedAgentId) &&
          isActiveTrackingStatus(state.orderStatus),
      );
    }

    if (!CUSTOMER_ORDER_EVENTS.has(event.event)) return false;

    const status =
      typeof payload?.status === "string"
        ? payload.status
        : EVENT_STATUS[event.event];
    if (state.trackedOrderId && status) state.orderStatus = status;

    const assignedAgentId =
      typeof payload?.agentId === "string"
        ? payload.agentId
        : event.event === "ORDER_UPDATED" && payload?.agentId == null
          ? null
          : undefined;
    if (state.trackedOrderId && assignedAgentId !== undefined) {
      state.assignedAgentId = assignedAgentId;
    }

    return true;
  };

  const ownership = isOwnedOrder(orderId);
  return typeof ownership === "boolean"
    ? finishAuthorization(ownership)
    : Promise.resolve(ownership).then(finishAuthorization);
}
