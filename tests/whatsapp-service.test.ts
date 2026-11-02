import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { sendDispatchUpdate } from '../lib/services/whatsappService';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FAST2SMS_WHATSAPP_API_KEY;
  delete process.env.FAST2SMS_API_KEY;
});

describe('WhatsApp provider error handling', () => {
  it('does not expose provider exception details', async () => {
    process.env.FAST2SMS_WHATSAPP_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('authorization secret and internal URL')),
    );

    const result = await sendDispatchUpdate({
      customerPhone: '9876543210',
      customerName: 'Customer',
      agentName: 'Agent',
      agentPhone: '9876543210',
    });

    assert.deepEqual(result, {
      success: false,
      error: 'Fast2SMS WhatsApp request failed.',
    });
    assert.doesNotMatch(result.error || '', /authorization secret|internal URL/);
  });

  it('returns a safe failure when provider configuration is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendDispatchUpdate({
      customerPhone: '9876543210',
      customerName: 'Customer',
      agentName: 'Agent',
      agentPhone: '9876543210',
    });

    assert.equal(result.success, false);
    assert.equal(fetchMock.mock.calls.length, 0);
    assert.equal(result.error, 'FAST2SMS_API_KEY missing in server environment.');
  });

  it('does not expose provider rejection details or malformed response bodies', async () => {
    process.env.FAST2SMS_WHATSAPP_API_KEY = 'test-key';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        return: false,
        error: 'provider secret and internal URL',
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    const rejected = await sendDispatchUpdate({
      customerPhone: '9876543210',
      customerName: 'Customer',
      agentName: 'Agent',
      agentPhone: '9876543210',
    });
    const malformed = await sendDispatchUpdate({
      customerPhone: '9876543210',
      customerName: 'Customer',
      agentName: 'Agent',
      agentPhone: '9876543210',
    });

    assert.deepEqual(rejected, {
      success: false,
      requestId: undefined,
      error: 'Fast2SMS did not accept the WhatsApp dispatch update.',
    });
    assert.deepEqual(malformed, {
      success: false,
      requestId: undefined,
      error: 'Fast2SMS did not accept the WhatsApp dispatch update.',
    });
    assert.doesNotMatch(rejected.error || '', /provider secret|internal URL/);
  });
});
