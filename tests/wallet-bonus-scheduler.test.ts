import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const processExpiredWalletBonuses = vi.fn();

vi.mock('@/lib/walletBonusLifecycle', () => ({ processExpiredWalletBonuses }));

describe('wallet bonus expiry scheduler authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  it('rejects missing and malformed authorization headers', async () => {
    const { POST } = await import('@/app/api/internal/jobs/wallet-bonus-expiry/route');

    const missing = await POST(new NextRequest('http://localhost/api/internal/jobs/wallet-bonus-expiry', { method: 'POST' }));
    const malformed = await POST(new NextRequest('http://localhost/api/internal/jobs/wallet-bonus-expiry', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    }));

    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(processExpiredWalletBonuses).not.toHaveBeenCalled();
  });

  it('accepts the configured bearer secret and runs expiry processing', async () => {
    processExpiredWalletBonuses.mockResolvedValue({ candidates: 1, processed: 1 });
    const { POST } = await import('@/app/api/internal/jobs/wallet-bonus-expiry/route');

    const response = await POST(new NextRequest('http://localhost/api/internal/jobs/wallet-bonus-expiry', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { candidates: 1, processed: 1 } });
    expect(processExpiredWalletBonuses).toHaveBeenCalledOnce();
  });
});
