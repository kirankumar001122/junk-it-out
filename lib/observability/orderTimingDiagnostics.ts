export interface OrderTimingPhase {
  phase: string;
  durationMs: number;
}

const ALLOWED_META_KEYS = new Set([
  'orderId',
  'orderNumber',
  'financialDirection',
  'hasPaymentConfig',
]);

export class OrderExecutionTimer {
  private startTime: number;
  private lastPhaseTime: number;
  private phases: OrderTimingPhase[] = [];
  public correlationId: string;

  constructor(correlationId?: string) {
    this.startTime = performance.now();
    this.lastPhaseTime = this.startTime;
    this.correlationId = correlationId || globalThis.crypto.randomUUID();
  }

  recordPhase(phaseName: string): number {
    const now = performance.now();
    const durationMs = Math.round((now - this.lastPhaseTime) * 100) / 100;
    this.phases.push({ phase: phaseName, durationMs });
    this.lastPhaseTime = now;
    return durationMs;
  }

  finish(extraMeta?: Record<string, unknown>) {
    const totalDurationMs = Math.round((performance.now() - this.startTime) * 100) / 100;

    const sanitizedMeta: Record<string, unknown> = {};
    if (extraMeta && typeof extraMeta === 'object') {
      for (const [key, value] of Object.entries(extraMeta)) {
        if (ALLOWED_META_KEYS.has(key) && (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')) {
          sanitizedMeta[key] = value;
        }
      }
    }

    const summary = {
      timestamp: new Date().toISOString(),
      event: 'order.execution.timing',
      correlationId: this.correlationId,
      totalDurationMs,
      phases: this.phases,
      ...sanitizedMeta,
    };
    console.info(JSON.stringify(summary));
    return summary;
  }
}
