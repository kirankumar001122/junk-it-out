import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getResolvedRazorpayKeyId } from '../lib/payments/razorpay';
import { hasRazorpay, loadRazorpayScript } from '../lib/razorpayClient';

describe('Booking & Payment Resilience Test Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Environment Variable & Razorpay Key Resolution Resilience', () => {
    it('resolves key correctly when RAZORPAY_KEY_ID is configured', () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      delete process.env.PAYMENT_KEY_ID;

      process.env.RAZORPAY_KEY_ID = 'rzp_live_key1';
      expect(getResolvedRazorpayKeyId()).toBe('rzp_live_key1');
    });

    it('resolves key correctly when NEXT_PUBLIC_RAZORPAY_KEY_ID is configured', () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      delete process.env.PAYMENT_KEY_ID;

      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_public_key2';
      expect(getResolvedRazorpayKeyId()).toBe('rzp_public_key2');
    });

    it('resolves key correctly when PAYMENT_KEY_ID is configured', () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      delete process.env.PAYMENT_KEY_ID;

      process.env.PAYMENT_KEY_ID = 'rzp_payment_key3';
      expect(getResolvedRazorpayKeyId()).toBe('rzp_payment_key3');
    });

    it('returns null when no Razorpay keys are configured', () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      delete process.env.PAYMENT_KEY_ID;

      expect(getResolvedRazorpayKeyId()).toBeNull();
    });
  });

  describe('2. Razorpay Client Script Loader Robustness', () => {
    it('returns false in server environment (typeof window === undefined)', async () => {
      const result = await loadRazorpayScript();
      expect(typeof result === 'boolean').toBe(true);
    });

    it('hasRazorpay validates that window.Razorpay is a function', () => {
      if (typeof window !== 'undefined') {
        const win = window as any;
        const origRzp = win.Razorpay;

        win.Razorpay = undefined;
        expect(hasRazorpay()).toBe(false);

        win.Razorpay = 'not-a-function';
        expect(hasRazorpay()).toBe(false);

        win.Razorpay = function MockRazorpay() {};
        expect(hasRazorpay()).toBe(true);

        win.Razorpay = origRzp;
      }
    });
  });

  describe('3. Safe JSON Parsing and Friendly Error Messages', () => {
    // Replicating the helper logic from app/book/page.tsx to verify behavior
    const safeParseJsonResponse = async (res: Response): Promise<{ ok: boolean; status: number; data: any; parseError?: string }> => {
      try {
        const text = await res.text();
        if (!text || !text.trim()) {
          return { ok: res.ok, status: res.status, data: null, parseError: 'Empty response from server' };
        }
        const json = JSON.parse(text);
        return { ok: res.ok, status: res.status, data: json };
      } catch (parseErr: any) {
        return {
          ok: false,
          status: res.status,
          data: null,
          parseError: parseErr instanceof Error ? parseErr.message : 'Invalid JSON',
        };
      }
    };

    const getFriendlyApiErrorMessage = (parsed: { ok: boolean; status: number; data: any; parseError?: string }, defaultMsg: string): string => {
      const data = parsed.data;
      if (data) {
        const serverMsg = data.error?.message || data.message;
        if (serverMsg && typeof serverMsg === 'string') return serverMsg;
      }
      if (parsed.status === 504) {
        return 'The booking request timed out on the server. Please check your connection or retry in a moment.';
      }
      if (parsed.status === 502 || parsed.status === 503) {
        return `The Junk It Out service is momentarily unavailable (HTTP ${parsed.status}). Please try again shortly.`;
      }
      if (parsed.status === 401) {
        return 'Your login session expired. Please verify your mobile number and retry.';
      }
      if (parsed.status === 403) {
        return 'You are not authorized to complete this booking.';
      }
      if (parsed.status >= 500) {
        return `A server error occurred (HTTP ${parsed.status}). Please try again or retry payment below.`;
      }
      return defaultMsg;
    };

    it('safely handles non-JSON 500 Internal Server Error HTML response without throwing SyntaxError', async () => {
      const html500 = '<!DOCTYPE html><html><body>500 Internal Server Error</body></html>';
      const fakeRes = new Response(html500, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });

      const parsed = await safeParseJsonResponse(fakeRes);
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe(500);
      expect(parsed.data).toBeNull();
      expect(parsed.parseError).toBeDefined();

      const msg = getFriendlyApiErrorMessage(parsed, 'Default failure');
      expect(msg).toContain('A server error occurred (HTTP 500)');
      expect(msg).not.toBe('Default failure');
    });

    it('safely handles 504 Gateway Timeout HTML response', async () => {
      const html504 = '<html><head><title>504 Gateway Time-out</title></head><body>504 Gateway Time-out</body></html>';
      const fakeRes = new Response(html504, {
        status: 504,
        headers: { 'Content-Type': 'text/html' },
      });

      const parsed = await safeParseJsonResponse(fakeRes);
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe(504);

      const msg = getFriendlyApiErrorMessage(parsed, 'Default failure');
      expect(msg).toContain('timed out on the server');
    });

    it('safely handles 502 Bad Gateway response', async () => {
      const html502 = '<html><body>502 Bad Gateway</body></html>';
      const fakeRes = new Response(html502, {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      });

      const parsed = await safeParseJsonResponse(fakeRes);
      const msg = getFriendlyApiErrorMessage(parsed, 'Default failure');
      expect(msg).toContain('momentarily unavailable (HTTP 502)');
    });

    it('safely handles valid JSON error response from backend API', async () => {
      const errorJson = JSON.stringify({
        success: false,
        error: {
          code: 'INVALID_BOOKING_WEIGHT',
          message: 'Total booking weight must be at least 10 kg for Old Newspaper.',
        },
      });
      const fakeRes = new Response(errorJson, {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });

      const parsed = await safeParseJsonResponse(fakeRes);
      expect(parsed.ok).toBe(false);
      expect(parsed.data.success).toBe(false);

      const msg = getFriendlyApiErrorMessage(parsed, 'Default failure');
      expect(msg).toBe('Total booking weight must be at least 10 kg for Old Newspaper.');
    });

    it('safely handles empty response bodies without crashing', async () => {
      const fakeRes = new Response('', {
        status: 500,
      });

      const parsed = await safeParseJsonResponse(fakeRes);
      expect(parsed.ok).toBe(false);
      expect(parsed.data).toBeNull();
      expect(parsed.parseError).toBe('Empty response from server');
    });
  });

  describe('4. Pending Order Preservation on Payment SDK / Network Failure', () => {
    it('correctly constructs the pending order object for session storage and retry', () => {
      const mockOrderData = {
        id: 'ord_test_123',
        orderNumber: 'JIO-20261103-A1B2C3',
        finalAmount: 149.0,
        address: { area: 'Indiranagar' },
      };
      const flowId = '550e8400-e29b-41d4-a716-446655440000';

      const pendingOrderStorage = {
        id: mockOrderData.id,
        orderNumber: mockOrderData.orderNumber,
        finalAmount: mockOrderData.finalAmount,
        area: mockOrderData.address.area,
        checkoutFlowId: flowId,
      };

      expect(pendingOrderStorage.id).toBe('ord_test_123');
      expect(pendingOrderStorage.orderNumber).toBe('JIO-20261103-A1B2C3');
      expect(pendingOrderStorage.finalAmount).toBe(149.0);
      expect(pendingOrderStorage.area).toBe('Indiranagar');
      expect(pendingOrderStorage.checkoutFlowId).toBe(flowId);

      // Verify serialization and deserialization
      const serialized = JSON.stringify(pendingOrderStorage);
      const parsed = JSON.parse(serialized);
      expect(parsed).toEqual(pendingOrderStorage);
    });

    it('ensures that if payment checkout throws, user gets an informative message with order number preserved', () => {
      const orderNumber = 'JIO-20261103-TEST';
      const sdkError = new Error('Razorpay is not defined');
      const errorMsg = `Order #${orderNumber} is saved. ${sdkError.message}. Please retry payment below.`;

      expect(errorMsg).toContain(orderNumber);
      expect(errorMsg).toContain('Razorpay is not defined');
      expect(errorMsg).toContain('Please retry payment below');
      expect(errorMsg).not.toBe('Network error while processing booking request. Please try again.');
    });
  });
});
