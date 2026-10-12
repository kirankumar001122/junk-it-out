import { cp, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'junk-it-out-e2e-'));
const appRoot = path.join(tempRoot, 'app');
const nodeModules = path.join(repoRoot, 'node_modules');
const port = process.env.JIO_E2E_PORT || '3210';

const excluded = new Set(['.git', 'node_modules', '.next', '.vercel', '.aws', '.codex', '.agents', 'coverage', 'scratch']);
await cp(repoRoot, appRoot, {
  recursive: true,
  filter(source) {
    const relative = path.relative(repoRoot, source);
    if (!relative) return true;
    const parts = relative.split(path.sep);
    return !parts.some((part) => excluded.has(part) || part === '.npmrc' || part === '.netrc' || part.startsWith('.env'));
  },
});
await symlink(nodeModules, path.join(appRoot, 'node_modules'), 'junction');
if (process.env.JIO_E2E_TEMP_MANIFEST) {
  await writeFile(process.env.JIO_E2E_TEMP_MANIFEST, tempRoot, 'utf8');
}

const safeEnv = {};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'COMSPEC', 'PATHEXT']) {
  if (process.env[key]) safeEnv[key] = process.env[key];
}
Object.assign(safeEnv, {
  NODE_ENV: 'development',
  PORT: port,
  HOSTNAME: '127.0.0.1',
  DATABASE_URL: 'disabled-by-e2e-invalid-datasource-url',
  JWT_SECRET: 'synthetic-e2e-only-secret-not-for-authentication',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
  JIO_E2E_ISOLATED: '1',
});

const nextBin = path.join(nodeModules, 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', port], {
  cwd: appRoot,
  env: safeEnv,
  stdio: 'inherit',
});

let cleaning = false;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  const resolvedTemp = path.resolve(tempRoot);
  if (path.dirname(resolvedTemp) !== path.resolve(os.tmpdir()) || !path.basename(resolvedTemp).startsWith('junk-it-out-e2e-')) {
    throw new Error('Refusing to remove an unexpected temporary app path.');
  }
  // Remove the junction explicitly so recursive removal cannot traverse or
  // remain blocked on the repository's shared node_modules tree on Windows.
  await unlink(path.join(appRoot, 'node_modules')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rm(resolvedTemp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  if (process.env.JIO_E2E_TEMP_MANIFEST) {
    await unlink(process.env.JIO_E2E_TEMP_MANIFEST).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

const forwardSignal = (signal) => {
  process.removeListener(signal, forwardSignal);
  child.kill(signal);
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, forwardSignal);
}
child.on('error', async (error) => {
  console.error('Could not start isolated Next.js server:', error);
  await cleanup();
  process.exit(1);
});
child.on('exit', async (code, signal) => {
  await cleanup();
  process.removeListener('SIGINT', forwardSignal);
  process.removeListener('SIGTERM', forwardSignal);
  process.exit(code ?? (signal ? 1 : 0));
});
