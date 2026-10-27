import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestCli = resolve(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
const tsxCli = resolve(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const vitestStages = [
  ['test:security', [
    'tests/security-route-handlers.test.ts',
    'tests/admin-jwt-config.test.ts',
  ]],
  ['test:payments', [
    'tests/payment-idempotency.test.ts',
    'tests/razorpay-order-creation.test.ts',
  ]],
  ['test:observability', [
    'tests/health-routes.test.ts',
    'tests/structured-logger.test.ts',
    'tests/instrumentation.test.ts',
  ]],
];

const standaloneTests = [
  'tests/admin-login-demotion.test.ts',
  'tests/admin-reports.test.ts',
  'tests/admin-settlements.test.ts',
  'tests/admin-stats.test.ts',
  'tests/agent-booking-assignment-route.test.ts',
  'tests/agent-booking-notification.test.ts',
  'tests/agent-pickup-offer-notifications.test.ts',
  'tests/agent-location-route.test.ts',
  'tests/customer-pickups-response.test.ts',
  'tests/dispatch-recovery.test.ts',
  'tests/order-cancellation.test.ts',
  'tests/order-lifecycle.test.ts',
  'tests/payment-webhook-dispatch.test.ts',
  'tests/refund-routes.test.ts',
  'tests/refund-workflow.test.ts',
  'tests/sse.test.ts',
  'tests/tracking-location.test.ts',
  'tests/order-tracking-access.test.ts',
  'tests/order-idempotency.test.ts',
  'tests/booking-payload-idempotency.test.ts',
];
const standaloneOnly = process.argv.includes('--standalone-only');

function run(label, cli, args, nodeOptions = []) {
  console.log('\n=== ' + label + ' ===');
  const env = nodeOptions.includes('--conditions=react-server')
    ? {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--conditions=react-server']
          .filter(Boolean)
          .join(' '),
      }
    : process.env;
  const result = spawnSync(process.execPath, [...nodeOptions, cli, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    console.error(label + ' could not start: ' + result.error.name);
    process.exitCode = 1;
    return false;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return false;
  }

  return true;
}

if (!standaloneOnly) {
  for (const [stage, files] of vitestStages) {
    if (!run(stage, vitestCli, ['run', ...files])) process.exit(process.exitCode || 1);
  }
}

for (const file of standaloneTests) {
  if (!run(file, tsxCli, [file], ['--conditions=react-server'])) {
    process.exit(process.exitCode || 1);
  }
}
