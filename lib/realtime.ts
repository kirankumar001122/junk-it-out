/**
 * Server-Sent Events (SSE) Broadcaster for Junk It Out
 * Broadcasts real-time updates for Order Status and Agent GPS Locations
 * to Customer tracking screens, Agent dashboards, and Admin Live Maps.
 */

type Listener = (data: any) => void;

class RealtimeBroadcaster {
  private listeners: Set<Listener> = new Set();

  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(event: string, payload: any) {
    const message = { event, payload, timestamp: new Date().toISOString() };
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error("SSE Broadcast error:", err);
      }
    });
  }
}

/*
 * Keep ONE shared instance on globalThis.
 * In Next.js dev, each API route (and hot reload) can load this file
 * as a separate module copy, so a plain module-level instance means the
 * agent's location route broadcasts to a different object than the one
 * the customer's stream route is subscribed to.
 */
const globalForBroadcaster = globalThis as unknown as {
  __junkItOutBroadcaster?: RealtimeBroadcaster;
};

export const broadcaster =
  globalForBroadcaster.__junkItOutBroadcaster ??
  (globalForBroadcaster.__junkItOutBroadcaster = new RealtimeBroadcaster());
