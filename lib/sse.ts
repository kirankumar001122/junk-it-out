export type RealtimeEvent = {
  event: string;
  payload: unknown;
};

export type SseSubscription = (listener: (event: RealtimeEvent) => void) => () => void;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export function formatSseEvent(event: string, payload: unknown): string {
  if (!/^[A-Za-z0-9_]+$/.test(event)) {
    throw new Error("Invalid SSE event name.");
  }

  return `event: ${event}\ndata: ${JSON.stringify(payload) ?? "null"}\n\n`;
}

export function createSseResponse(options: {
  signal: AbortSignal;
  subscribe: SseSubscription;
  onEvent: (
    event: RealtimeEvent,
    send: (name: string, payload: unknown) => void,
  ) => void | Promise<void>;
  connectedPayload: unknown;
  heartbeatIntervalMs?: number;
  onConnect?: (send: (name: string, payload: unknown) => void) => void | Promise<void>;
}) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;
  let unsubscribe = () => {};
  let subscriptionReady = false;
  let unsubscribeRequested = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const detach = () => {
    unsubscribeRequested = true;
    if (!subscriptionReady) return;
    subscriptionReady = false;
    try {
      unsubscribe();
    } catch (error) {
      console.error("[SSE] Unsubscribe error:", error);
    }
  };

  const cleanup = (closeController: boolean) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    options.signal.removeEventListener("abort", onAbort);
    detach();
    try {
      if (closeController && controller) {
        controller.close();
      }
    } catch {
      // The runtime may already have closed or canceled the stream.
    }
  };

  const onAbort = () => cleanup(true);

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (options.signal.aborted) {
        cleanup(true);
        return;
      }

      const send = (name: string, payload: unknown) => {
        if (closed || !controller) return;
        try {
          controller.enqueue(encoder.encode(formatSseEvent(name, payload)));
        } catch {
          cleanup(false);
        }
      };

      const sendComment = (comment: string) => {
        if (closed || !controller) return;
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`));
        } catch {
          cleanup(false);
        }
      };

      options.signal.addEventListener("abort", onAbort, { once: true });
      send("connected", options.connectedPayload);

      try {
        unsubscribe = options.subscribe((event) => {
          if (closed) return;
          try {
            Promise.resolve(options.onEvent(event, send)).catch((error) => {
              console.error("[SSE] Async event dispatch error:", error);
            });
          } catch (error) {
            console.error("[SSE] Event dispatch error:", error);
          }
        });
        subscriptionReady = true;
      } catch (error) {
        console.error("[SSE] Subscription error:", error);
        cleanup(true);
        return;
      }

      if (closed) {
        if (unsubscribeRequested) detach();
        return;
      }

      try {
        Promise.resolve(options.onConnect?.(send)).catch((error) => {
          console.error('[SSE] Initial event dispatch error:', error);
        });
      } catch (error) {
        console.error('[SSE] Initial event dispatch error:', error);
      }

      if (options.heartbeatIntervalMs && options.heartbeatIntervalMs > 0) {
        heartbeat = setInterval(
          () => sendComment("ping"),
          options.heartbeatIntervalMs,
        );
      }

      // Close the subscribe/abort race if the client disconnected while the
      // broadcaster subscription was being created.
      if (options.signal.aborted) cleanup(true);
    },

    cancel() {
      cleanup(false);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
