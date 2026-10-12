import { readFile, rm, unlink } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const safeEnv = {};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'COMSPEC', 'PATHEXT']) {
  if (process.env[key]) safeEnv[key] = process.env[key];
}
const runId = `${process.pid}-${Date.now()}`;
const manifestPath = path.join(os.tmpdir(), `junk-it-out-e2e-${runId}.path`);
const port = String(15_000 + (process.pid % 45_000));
Object.assign(safeEnv, {
  NEXT_TELEMETRY_DISABLED: '1',
  JIO_E2E_PORT: port,
  JIO_E2E_MANAGED_SERVER: '1',
  JIO_E2E_TEMP_MANIFEST: manifestPath,
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const node = process.execPath;
const serverScript = path.join(repoRoot, 'tests', 'e2e', 'start-isolated-next.mjs');
const playwrightCli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const baseURL = `http://127.0.0.1:${port}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function waitForServer(child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Isolated Next.js server exited before becoming ready (code ${child.exitCode ?? child.signalCode}).`);
    }
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Isolated Next.js server did not become ready within ${timeoutMs}ms.`);
}

async function cleanupTempApp() {
  let tempRoot;
  try {
    tempRoot = path.resolve((await readFile(manifestPath, 'utf8')).trim());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }

  if (
    path.dirname(tempRoot) !== path.resolve(os.tmpdir()) ||
    !path.basename(tempRoot).startsWith('junk-it-out-e2e-')
  ) {
    throw new Error(`Refusing to remove unexpected isolated app path: ${tempRoot}`);
  }

  await unlink(path.join(tempRoot, 'app', 'node_modules')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  await unlink(manifestPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

let server;
let testProcess;
let requestedSignal;
const handleSignal = (signal) => {
  requestedSignal = signal;
  testProcess?.kill(signal);
};
process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

let exitCode = 1;
try {
  server = spawn(node, [serverScript], { cwd: repoRoot, env: safeEnv, stdio: 'inherit' });
  await waitForServer(server);

  testProcess = spawn(node, [playwrightCli, 'test', ...process.argv.slice(2)], {
    cwd: repoRoot,
    env: safeEnv,
    stdio: 'inherit',
  });
  const result = await waitForExit(testProcess);
  exitCode = result.code ?? (result.signal ? 1 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);

  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    const closed = await Promise.race([waitForExit(server).then(() => true), delay(10_000).then(() => false)]);
    if (!closed) {
      if (process.platform === 'win32' && server.pid) {
        spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5_000, windowsHide: true });
      } else {
        server.kill('SIGKILL');
      }
      await Promise.race([waitForExit(server), delay(5_000)]);
    }
  }

  try {
    await cleanupTempApp();
  } catch (error) {
    console.error('Failed to clean isolated Next.js app:', error instanceof Error ? error.message : error);
    exitCode = 1;
  }
}

process.exitCode = requestedSignal ? 1 : exitCode;
