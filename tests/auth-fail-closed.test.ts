import assert from 'node:assert/strict';
import { validatePayload } from '../lib/auth/middleware';
import { errorResponse } from '../lib/utils/apiResponse';
import { db } from '../lib/db';

async function run(): Promise<void> {
  const userDelegate = db.user as any;
  const originalFindUnique = userDelegate.findUnique;
  userDelegate.findUnique = async () => ({ tokenVersion: 1 });

  try {
    const agentPayload = {
      userId: 'local-test-agent',
      phone: 'local-test-only',
      role: 'AGENT' as const,
      agentId: 'local-test-agent-record',
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    assert.equal(
      await validatePayload(agentPayload, async () => {
        throw new Error('private database detail');
      }),
      null,
      'agent authorization must fail closed when token-version lookup fails',
    );
    assert.equal(
      await validatePayload(agentPayload, async () => ({ tokenVersion: 2 })),
      null,
      'stale agent tokens must be rejected',
    );
    assert.equal(
      await validatePayload(agentPayload, async () => ({ tokenVersion: 1 })),
      agentPayload,
      'current agent tokens remain valid',
    );

    const response = errorResponse(
      'INTERNAL_SERVER_ERROR',
      'private database detail',
      500,
      { secret: 'private' },
    );
    const body = await response.json();
    assert.equal(body.error.message, 'An unexpected error occurred. Please try again.');
    assert.equal('details' in body.error, false);

    console.log('Agent fail-closed auth and internal error sanitization tests passed.');
  } finally {
    userDelegate.findUnique = originalFindUnique;
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Authentication hardening tests failed.');
  process.exitCode = 1;
});
