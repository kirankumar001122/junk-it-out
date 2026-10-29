import { after } from 'next/server';

/**
 * Runs a non-blocking background task outside the HTTP response path.
 * In Next.js request lifecycle, it uses after() so serverless functions stay alive until completion.
 * In standalone test runners or CLI scripts, it gracefully falls back to setImmediate.
 *
 * Each task runs within an isolated error boundary ensuring background failures never
 * leak unhandled rejections or disrupt user-facing HTTP responses.
 */
export function runBackgroundTask(
  task: () => Promise<void> | void,
  taskName?: string
): void {
  const safeTask = async () => {
    const startedAt = Date.now();
    try {
      await task();
      const durationMs = Date.now() - startedAt;
      if (durationMs > 2000) {
        console.warn(
          `[BACKGROUND TASK SLOW${taskName ? `: ${taskName}` : ''}] Completed in ${durationMs}ms`
        );
      }
    } catch (err: any) {
      console.warn(
        `[BACKGROUND TASK NOTICE${taskName ? `: ${taskName}` : ''}] Safe execution error:`,
        err?.message || err
      );
    }
  };

  try {
    after(safeTask);
  } catch {
    setImmediate(() => {
      safeTask();
    });
  }
}
