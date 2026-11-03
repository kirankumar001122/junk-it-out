import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isReceiptEligible,
  getReceiptFilename,
  generateReceiptPdfBytes,
  escapePdfText,
  formatPdfCurrency,
} from '@/lib/receiptPdf';
import { GET as getReceiptRoute } from '@/app/api/orders/[id]/receipt/route';
import { db } from '@/lib/db';
import { signToken } from '@/lib/auth/jwt';

describe('Receipt PDF Generation & Eligibility', () => {
  const sampleCompletedOrder = {
    id: 'c3a41b49-5d70-439d-86b4-a67330fc819a',
    orderNumber: 'JIO-20261014-OTX1VA',
    customerId: 'customer-1',
    createdAt: '2026-10-14T10:30:00.000Z',
    status: 'PICKUP_COMPLETED',
    pickupType: 'SCHEDULED',
    scheduledSlot: '14 Oct 2026, 11:00 AM - 12:00 PM',
    paymentStatus: 'CAPTURED',
    financialDirection: 'JUNKITOUT_PAYS',
    actualTotal: 180.0,
    pickupCharge: 39.0,
    finalAmount: 180.0,
    customer: {
      userId: 'user-1',
      user: {
        name: 'DEGA PARTHIV',
        phone: '+91 7842259582',
        email: 'parthiv@example.com',
      },
    },
    agent: {
      user: { name: 'Ramesh Kumar' },
      vehicleType: 'Electric Auto',
      vehicleNumber: 'KA-05-EA-1234',
    },
    address: {
      houseNo: '#14 BTM Layout',
      street: '1st & 2nd Stage',
      area: 'JP Nagar 9th Phase',
      city: 'Bengaluru',
      pincode: '560078',
    },
    items: [
      {
        id: 'i-1',
        category: { name: 'Plastic Waste' },
        actualWeight: 10.0,
        ratePerKg: 18.0,
        subtotal: 180.0,
      },
    ],
    settlement: {
      amount: 180.0,
      totalWeightKg: 10.0,
      status: 'READY_FOR_PAYOUT',
    },
    invoices: [
      {
        invoiceNumber: 'INV-20261014-K7OGLU',
        createdAt: '2026-10-14T11:15:00.000Z',
      },
    ],
    payments: [
      {
        id: 'pmt-1',
        gateway: 'RAZORPAY',
        gatewayPaymentId: 'pay_P14otxRazorpay789',
        gatewayOrderId: 'order_rzp_otx456',
        amount: 3900,
        status: 'CAPTURED',
        capturedAt: '2026-10-14T10:32:00.000Z',
      },
    ],
  };

  describe('isReceiptEligible', () => {
    it('returns true when order has invoices', () => {
      expect(isReceiptEligible({ invoices: [{ invoiceNumber: 'INV-001' }] })).toBe(true);
    });

    it('returns true when status is PICKUP_COMPLETED', () => {
      expect(isReceiptEligible({ status: 'PICKUP_COMPLETED' })).toBe(true);
    });

    it('returns true when status is SETTLEMENT_COMPLETED', () => {
      expect(isReceiptEligible({ status: 'SETTLEMENT_COMPLETED' })).toBe(true);
    });

    it('returns true when order has a settlement record', () => {
      expect(isReceiptEligible({ settlement: { amount: 150 } })).toBe(true);
    });

    it('returns true when paymentStatus is CAPTURED or PAID', () => {
      expect(isReceiptEligible({ paymentStatus: 'CAPTURED' })).toBe(true);
      expect(isReceiptEligible({ paymentStatus: 'PAID' })).toBe(true);
      expect(isReceiptEligible({ paymentStatus: 'SUCCESS' })).toBe(true);
    });

    it('returns true when payments array contains captured payment', () => {
      expect(isReceiptEligible({ payments: [{ status: 'CAPTURED' }] })).toBe(true);
    });

    it('returns false for null, undefined, or pending unpaid initial bookings', () => {
      expect(isReceiptEligible(null)).toBe(false);
      expect(isReceiptEligible(undefined)).toBe(false);
      expect(isReceiptEligible({})).toBe(false);
      expect(isReceiptEligible({ status: 'BOOKING_RECEIVED', paymentStatus: 'PENDING' })).toBe(false);
    });
  });

  describe('getReceiptFilename', () => {
    it('creates filename with order number', () => {
      expect(getReceiptFilename({ orderNumber: 'JIO 20261014 OTX1VA' })).toBe('Receipt-JIO-20261014-OTX1VA.pdf');
    });

    it('falls back to order id if orderNumber is missing', () => {
      expect(getReceiptFilename({ id: 'abc-123-xyz' })).toBe('Receipt-abc-123-xyz.pdf');
    });

    it('sanitizes unsafe characters', () => {
      expect(getReceiptFilename({ orderNumber: 'ORD/2026#001*TEST' })).toBe('Receipt-ORD2026001TEST.pdf');
    });
  });

  describe('generateReceiptPdfBytes', () => {
    it('generates a valid PDF byte buffer for completed order', () => {
      const bytes = generateReceiptPdfBytes(sampleCompletedOrder);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(1000);

      const pdfString = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      // Verify PDF 1.4 header and EOF
      expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfString.includes('%%EOF')).toBe(true);
      expect(pdfString.includes('xref')).toBe(true);
      expect(pdfString.includes('trailer')).toBe(true);

      // Verify key information in receipt
      expect(pdfString).toContain('JUNK IT OUT');
      expect(pdfString).toContain('JIO-20261014-OTX1VA');
      expect(pdfString).toContain('INV-20261014-K7OGLU');
      expect(pdfString).toContain('DEGA PARTHIV');
      expect(pdfString).toContain('Plastic Waste');
      expect(pdfString).toContain('CUSTOMER PAYOUT AMOUNT');
      expect(pdfString).toContain('pay_P14otxRazorpay789');
    });

    it('generates a valid PDF for customer payable order', () => {
      const payableOrder = {
        ...sampleCompletedOrder,
        financialDirection: 'CUSTOMER_PAYS',
        finalAmount: 69.0,
      };

      const bytes = generateReceiptPdfBytes(payableOrder);
      const pdfString = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

      expect(pdfString).toContain('CUSTOMER AMOUNT PAYABLE');
      expect(pdfString).toContain('Rs. 69.00');
    });

    it('handles orders with empty items and minimal fields gracefully', () => {
      const minimalOrder = {
        id: 'ord-min-1',
        status: 'PICKUP_COMPLETED',
        paymentStatus: 'CAPTURED',
      };

      const bytes = generateReceiptPdfBytes(minimalOrder);
      expect(bytes.length).toBeGreaterThan(500);

      const pdfString = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfString).toContain('ord-min-1');
    });

    it('throws when given invalid order data', () => {
      expect(() => generateReceiptPdfBytes(null)).toThrow('Invalid order data');
    });
  });

  describe('escapePdfText and formatPdfCurrency', () => {
    it('escapes parentheses and backslashes properly', () => {
      expect(escapePdfText('Test (Parens) and \\Slash\\')).toBe('Test \\(Parens\\) and \\\\Slash\\\\');
    });

    it('formats currencies consistently', () => {
      expect(formatPdfCurrency(123.456)).toBe('Rs. 123.46');
      expect(formatPdfCurrency('42')).toBe('Rs. 42.00');
      expect(formatPdfCurrency(null)).toBe('Rs. 0.00');
      expect(formatPdfCurrency(undefined)).toBe('Rs. 0.00');
    });
  });

  describe('GET /api/orders/[id]/receipt route handler', () => {
    const originalFindFirst = (db.order as any).findFirst;

    it('returns 401 when request is not authenticated', async () => {
      const req = new NextRequest('http://localhost/api/orders/test-1/receipt');
      const res = await getReceiptRoute(req, { params: Promise.resolve({ id: 'test-1' }) });
      expect(res.status).toBe(401);
    });

    it('returns 404 when order does not exist', async () => {
      (db.order as any).findFirst = async () => null;

      const token = signToken({
        userId: 'user-1',
        customerId: 'customer-1',
        phone: '9999999999',
        role: 'CUSTOMER',
      });

      const req = new NextRequest('http://localhost/api/orders/missing-id/receipt', {
        headers: { Cookie: `jio_token=${token}` },
      });

      try {
        const res = await getReceiptRoute(req, { params: Promise.resolve({ id: 'missing-id' }) });
        expect(res.status).toBe(404);
      } finally {
        (db.order as any).findFirst = originalFindFirst;
      }
    });

    it('returns 403 when customer does not own order', async () => {
      (db.order as any).findFirst = async () => ({
        ...sampleCompletedOrder,
        customerId: 'other-cust',
        customer: { userId: 'other-user' },
      });

      const token = signToken({
        userId: 'user-1',
        customerId: 'customer-1',
        phone: '9999999999',
        role: 'CUSTOMER',
      });

      const req = new NextRequest('http://localhost/api/orders/test-id/receipt', {
        headers: { Cookie: `jio_token=${token}` },
      });

      try {
        const res = await getReceiptRoute(req, { params: Promise.resolve({ id: 'test-id' }) });
        expect(res.status).toBe(403);
      } finally {
        (db.order as any).findFirst = originalFindFirst;
      }
    });

    it('returns 200 with PDF attachment when authenticated owner requests eligible receipt', async () => {
      (db.order as any).findFirst = async () => sampleCompletedOrder;

      const token = signToken({
        userId: 'user-1',
        customerId: 'customer-1',
        phone: '9999999999',
        role: 'CUSTOMER',
      });

      const req = new NextRequest('http://localhost/api/orders/c3a41b49-5d70-439d-86b4-a67330fc819a/receipt', {
        headers: { Cookie: `jio_token=${token}` },
      });

      try {
        const res = await getReceiptRoute(req, { params: Promise.resolve({ id: 'c3a41b49-5d70-439d-86b4-a67330fc819a' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="Receipt-JIO-20261014-OTX1VA.pdf"');

        const arrayBuffer = await res.arrayBuffer();
        expect(arrayBuffer.byteLength).toBeGreaterThan(1000);
        const headerSlice = new Uint8Array(arrayBuffer.slice(0, 8));
        const headerStr = String.fromCharCode(...headerSlice);
        expect(headerStr).toContain('%PDF-1.4');
      } finally {
        (db.order as any).findFirst = originalFindFirst;
      }
    });
  });
});
