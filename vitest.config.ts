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
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/security-route-handlers.test.ts',
      'tests/admin-security-hardening.test.ts',
      'tests/payment-idempotency.test.ts',
      'tests/payment-retry-and-feedback.test.ts',
      'tests/booking-coupon-support.test.ts',
      'tests/health-route.test.ts',
    ],
  },
});
