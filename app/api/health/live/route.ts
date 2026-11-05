// Pure Clean Monitoring, Logging & Alerting - Single File

const SENSITIVE = ['password', 'token', 'secret', 'authorization', 'cookie', 'card', 'pin'];

function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const k of Object.keys(out)) {
    if (SENSITIVE.some(s => k.toLowerCase().includes(s))) out[k] = '[REDACTED]';
    else if (typeof out[k] === 'object') out[k] = redact(out[k]);
  }
  return out;
}

function log(level: string, message: string, meta: any = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'junk-it-out',
    ...redact(meta),
  }));
}

let totalRequests = 0;
let totalErrors = 0;
let totalLatency = 0;

function recordMetrics(latencyMs: number, isError: boolean) {
  totalRequests++;
  totalLatency += latencyMs;
  if (isError) totalErrors++;
}

function getMetrics() {
  const avgLatency = totalRequests ? Math.round(totalLatency / totalRequests) : 0;
  const errorRate = totalRequests ? Number((totalErrors / totalRequests).toFixed(3)) : 0;
  return { totalRequests, totalErrors, avgLatencyMs: avgLatency, errorRate };
}

function checkAlerts(metrics: any, dbOk: boolean) {
  const alerts: string[] = [];
  if (metrics.avgLatencyMs > 1000) alerts.push('HIGH_LATENCY');
  if (metrics.errorRate > 0.05 && metrics.totalRequests > 10) alerts.push('HIGH_ERROR_RATE');
  if (!dbOk) alerts.push('DB_DOWN');
  if (alerts.length > 0) {
    log('warn', 'ALERT_TRIGGERED', { alerts, metrics, dbOk });
  }
  return alerts;
}

async function checkDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await Promise.resolve();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    log('error', 'DB_HEALTH_FAILED', { error: String(e) });
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const start = Date.now();
  try {
    const db = await checkDb();
    const latencyMs = Date.now() - start;
    recordMetrics(latencyMs, !db.ok);
    const metrics = getMetrics();
    const alerts = checkAlerts(metrics, db.ok);

    log('info', 'health_check', { db, metrics, alerts, latencyMs });

    const isHealthy = db.ok;

    return Response.json(
      {
        status: isHealthy ? 'alive' : 'degraded',
        timestamp: new Date().toISOString(),
        db,
        metrics,
        alerts,
        uptime: process.uptime(),
      },
      {
        status: isHealthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    recordMetrics(Date.now() - start, true);
    log('error', 'health_check_failed', { error: String(error) });
    return Response.json(
      { status: 'down', error: 'health check failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}