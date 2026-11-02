/**
 * Server-Sent Events (SSE) Broadcaster for Junk It Out
 * Broadcasts real-time updates for Order Status and Agent GPS Locations
 * to Customer tracking screens, Agent dashboards, and Admin Live Maps.
 *
 * Implements a pluggable EventTransportAdapter architecture to support:
 * 1. InMemoryTransportAdapter (Default, single-instance / local dev)
 * 2. Distributed Pub/Sub Adapter (Ready for Redis / Upstash in multi-replica deployments)
 */

export type BroadcasterMessage = {
  event: string;
  payload: any;
  timestamp: string;
};

export type Listener = (data: BroadcasterMessage) => void;

/**
 * Transport adapter interface allowing pluggable horizontal scaling without
 * modifying SSE route handlers or business logic.
 */
export interface EventTransportAdapter {
  publish(event: string, payload: any): Promise<void> | void;
  subscribe(listener: Listener): () => void;
}

/**
 * In-memory adapter using local event listeners for single-process environments.
 */
export class InMemoryTransportAdapter implements EventTransportAdapter {
  private listeners: Set<Listener> = new Set();

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public publish(event: string, payload: any): void {
    const message: BroadcasterMessage = {
      event,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('[SSE_BROADCAST_ERROR]', err);
      }
    });
  }
}

/**
 * High-level Broadcaster singleton wrapping the transport adapter.
 */
export class RealtimeBroadcaster {
  private adapter: EventTransportAdapter;

  constructor(adapter?: EventTransportAdapter) {
    this.adapter = adapter ?? new InMemoryTransportAdapter();
  }

  /**
   * Allows setting a distributed adapter (e.g. RedisPubSubAdapter) at runtime.
   */
  public setAdapter(adapter: EventTransportAdapter) {
    this.adapter = adapter;
  }

  public subscribe(listener: Listener): () => void {
    return this.adapter.subscribe(listener);
  }

  public broadcast(event: string, payload: any): void {
    this.adapter.publish(event, payload);
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
