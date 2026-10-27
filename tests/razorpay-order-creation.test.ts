import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { beforeEach, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  responseBody: '',
  statusCode: 200,
  requestBody: '',
}));

vi.mock('https', () => ({
  default: {
    request: vi.fn((_options, onResponse) => {
      const request = new EventEmitter() as EventEmitter & {
        write: (body: string) => void;
        end: () => void;
        destroy: () => void;
        body?: string;
      };
      request.write = (body) => {
        request.body = body;
        state.requestBody = body;
      };
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
        };
        response.statusCode = state.statusCode;
        onResponse(response);
        response.emit('data', state.responseBody);
        response.emit('end');
      };
      request.destroy = () => undefined;
      return request;
    }),
  },
}));

import { createRazorpayOrder, RazorpayOrderCreationError } from '@/lib/payments/razorpay';

beforeEach(() => {
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test_mock');
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'mock_secret');
  state.responseBody = JSON.stringify({ id: 'order_mock_123', amount: 12500, currency: 'INR' });
  state.statusCode = 200;
  state.requestBody = '';
});

test('creates provider orders from the expected paise amount and returns the gateway ID', async () => {
  const result = await createRazorpayOrder({
    amountInPaise: 12500,
    receipt: 'JIO-TEST-001',
  });

  assert.equal(result.id, 'order_mock_123');
  assert.equal(result.keyId, 'rzp_test_mock');
  assert.equal(JSON.parse(state.requestBody).amount, 12500);
});

test('rejects a successful HTTP response without a usable gateway order ID', async () => {
  state.responseBody = JSON.stringify({ amount: 12500, currency: 'INR' });

  await assert.rejects(
    createRazorpayOrder({
      amountInPaise: 12500,
      receipt: 'JIO-TEST-001',
    }),
    (error: unknown) =>
      error instanceof RazorpayOrderCreationError &&
      error.message === 'Invalid response received from Razorpay gateway.' &&
      error.statusCode === 502 &&
      !error.uncertain,
  );
});
