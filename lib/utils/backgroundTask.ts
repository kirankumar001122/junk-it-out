import { after } from 'next/server';

/**
 * Runs a non-blocking background task outside the HTTP response path.
 * In Next.js request lifecycle, it uses after() so serverless functions stay alive until completion.
 * In standalone test runners or CLI scripts, it gracefully falls back to setImmediate.
 */
export function runBackgroundTask(task: () => Promise<void> | void): void {
  try {
    after(task);
  } catch {
    setImmediate(() => {
      Promise.resolve()
        .then(() => task())
        .catch((err: any) => {
          console.warn('[BACKGROUND TASK NOTICE] Task error:', err?.message);
        });
    });
  }
}
