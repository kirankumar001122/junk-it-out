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
        console.error('SSE Broadcast error:', err);
      }
    });
  }
}

export const broadcaster = new RealtimeBroadcaster();
