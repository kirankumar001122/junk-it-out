import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const tsconfig = JSON.parse(
  readFileSync(resolve(projectRoot, 'tsconfig.json'), 'utf8'),
) as {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};
const aliasTarget = tsconfig.compilerOptions?.paths?.['@/*']?.[0];

if (!aliasTarget) {
  throw new Error('tsconfig.json must define the @/* path alias');
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(projectRoot, aliasTarget.replace(/\/\*$/, '')),
      'server-only': resolve(projectRoot, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/security-route-handlers.test.ts',
<<<<<<< HEAD
      'tests/admin-jwt-config.test.ts',
=======
      'tests/admin-security-hardening.test.ts',
>>>>>>> origin/main
      'tests/payment-idempotency.test.ts',
      'tests/razorpay-order-creation.test.ts',
      'tests/health-routes.test.ts',
      'tests/structured-logger.test.ts',
      'tests/instrumentation.test.ts',
      'tests/payment-retry-and-feedback.test.ts',
      'tests/booking-coupon-support.test.ts',
      'tests/health-route.test.ts',
    ],
  },
});
