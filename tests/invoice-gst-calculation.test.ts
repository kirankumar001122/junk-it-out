import { describe, it, expect } from 'vitest';
import {
  calculateTaxBreakdown,
  getOrderTaxBreakdown,
  DEFAULT_GST_RATE,
  normalizeStateName,
} from '@/lib/pricing/tax';
import { generateReceiptPdfBytes } from '@/lib/receiptPdf';

describe('Task 03 — Invoice and GST Calculation Upgrade', () => {
  describe('1. Statutory GST Calculation & Line Item Separation', () => {
    it('applies GST ONLY to the taxable service fee, not the pickup fee', () => {
      const breakdown = calculateTaxBreakdown({
        pickupFee: 50.0,
        serviceFee: 30.0,
        state: 'Karnataka',
        gstRate: 0.18,
      });

      // 1. Separate line items
      expect(breakdown.pickupFee).toBe(50.0);
      expect(breakdown.serviceFee).toBe(30.0);

      // 2. Subtotal = pickup fee + service fee
      expect(breakdown.subtotal).toBe(80.0);

      // 3. Taxable value = service fee only
      expect(breakdown.taxableAmount).toBe(30.0);

      // 4. GST amount = 18% of 30.0 = 5.40 (pickup fee 50.0 is excluded from tax)
      expect(breakdown.gstAmount).toBe(5.4);

      // 5. Intra-state split: CGST 9% (2.70) + SGST 9% (2.70)
      expect(breakdown.isInterState).toBe(false);
      expect(breakdown.cgstRate).toBe(0.09);
      expect(breakdown.sgstRate).toBe(0.09);
      expect(breakdown.cgstAmount).toBe(2.7);
      expect(breakdown.sgstAmount).toBe(2.7);
      expect(breakdown.cgstAmount + breakdown.sgstAmount).toBe(breakdown.gstAmount);

      // 6. Final total = pickup fee (50) + service fee (30) + GST (5.40) = 85.40
      expect(breakdown.totalFeeWithGst).toBe(85.4);
    });

    it('supports inter-state transactions with 100% IGST', () => {
      const breakdown = calculateTaxBreakdown({
        pickupFee: 40.0,
        serviceFee: 60.0,
        state: 'Tamil Nadu', // Inter-state from Karnataka
        gstRate: 0.18,
      });

      expect(breakdown.isInterState).toBe(true);
      expect(breakdown.taxableAmount).toBe(60.0);
      expect(breakdown.gstAmount).toBe(10.8);
      expect(breakdown.cgstAmount).toBe(0);
      expect(breakdown.sgstAmount).toBe(0);
      expect(breakdown.igstRate).toBe(0.18);
      expect(breakdown.igstAmount).toBe(10.8);
      expect(breakdown.totalFeeWithGst).toBe(40.0 + 60.0 + 10.8);
    });

    it('supports configurable GST rates', () => {
      const rates = [0.05, 0.12, 0.18, 0.28];
      for (const rate of rates) {
        const breakdown = calculateTaxBreakdown({
          pickupFee: 20.0,
          serviceFee: 100.0,
          state: 'Karnataka',
          gstRate: rate,
        });

        const expectedGst = Math.round(100.0 * rate * 100) / 100;
        expect(breakdown.gstAmount).toBe(expectedGst);
        expect(breakdown.totalFeeWithGst).toBe(20.0 + 100.0 + expectedGst);
      }
    });

    it('handles zero service fee (promotional waiver) with 0 GST', () => {
      const breakdown = calculateTaxBreakdown({
        pickupFee: 50.0,
        serviceFee: 0.0, // Waived
        state: 'Karnataka',
        gstRate: 0.18,
      });

      expect(breakdown.pickupFee).toBe(50.0);
      expect(breakdown.serviceFee).toBe(0.0);
      expect(breakdown.taxableAmount).toBe(0.0);
      expect(breakdown.gstAmount).toBe(0.0);
      expect(breakdown.cgstAmount).toBe(0.0);
      expect(breakdown.sgstAmount).toBe(0.0);
      expect(breakdown.totalFeeWithGst).toBe(50.0);
    });

    it('handles zero pickup fee with GST applied to service fee', () => {
      const breakdown = calculateTaxBreakdown({
        pickupFee: 0.0,
        serviceFee: 50.0,
        state: 'Karnataka',
        gstRate: 0.18,
      });

      expect(breakdown.pickupFee).toBe(0.0);
      expect(breakdown.serviceFee).toBe(50.0);
      expect(breakdown.taxableAmount).toBe(50.0);
      expect(breakdown.gstAmount).toBe(9.0);
      expect(breakdown.cgstAmount).toBe(4.5);
      expect(breakdown.sgstAmount).toBe(4.5);
      expect(breakdown.totalFeeWithGst).toBe(59.0);
    });

    it('handles completely free booking (both zero) safely', () => {
      const breakdown = calculateTaxBreakdown({
        pickupFee: 0,
        serviceFee: 0,
      });

      expect(breakdown.subtotal).toBe(0);
      expect(breakdown.taxableAmount).toBe(0);
      expect(breakdown.gstAmount).toBe(0);
      expect(breakdown.totalFeeWithGst).toBe(0);
    });

    it('guarantees integer-paise reconciliation without 1-paise divergence on odd amounts', () => {
      // 33.33 * 0.18 = 5.9994 -> 6.00 GST (600 paise)
      // CGST: 300 paise (3.00), SGST: 300 paise (3.00)
      const oddBreakdown = calculateTaxBreakdown({
        pickupFee: 17.55,
        serviceFee: 33.33,
        state: 'Karnataka',
        gstRate: 0.18,
      });

      expect(oddBreakdown.cgstAmountPaise + oddBreakdown.sgstAmountPaise).toBe(oddBreakdown.gstAmountPaise);
      expect(oddBreakdown.subtotalPaise + oddBreakdown.gstAmountPaise).toBe(oddBreakdown.totalFeeWithGstPaise);
      expect(oddBreakdown.cgstAmount + oddBreakdown.sgstAmount).toBeCloseTo(oddBreakdown.gstAmount, 2);
    });
  });

  describe('2. State Normalization & Jurisdiction Rules', () => {
    it('recognizes various forms of Karnataka as intra-state', () => {
      expect(normalizeStateName('Karnataka')).toBe('Karnataka');
      expect(normalizeStateName('karnataka')).toBe('Karnataka');
      expect(normalizeStateName('KA')).toBe('Karnataka');
      expect(normalizeStateName('Bengaluru')).toBe('Karnataka');
      expect(normalizeStateName('Bangalore')).toBe('Karnataka');
      expect(normalizeStateName(null)).toBe('Karnataka');
      expect(normalizeStateName(undefined)).toBe('Karnataka');
    });

    it('recognizes other states as inter-state', () => {
      expect(normalizeStateName('Maharashtra')).toBe('Maharashtra');
      expect(normalizeStateName('Delhi')).toBe('Delhi');
      expect(normalizeStateName('Telangana')).toBe('Telangana');
    });
  });

  describe('3. Order Tax Breakdown & Historical Immutability', () => {
    it('extracts tax from new order with explicit columns', () => {
      const newOrder = {
        pickupFee: 35.0,
        serviceFee: 25.0,
        gstRate: 0.18,
        address: { city: 'Bengaluru' },
      };

      const breakdown = getOrderTaxBreakdown(newOrder);
      expect(breakdown.pickupFee).toBe(35.0);
      expect(breakdown.serviceFee).toBe(25.0);
      expect(breakdown.taxableAmount).toBe(25.0);
      expect(breakdown.gstAmount).toBe(4.5); // 18% of 25 = 4.50
      expect(breakdown.totalFeeWithGst).toBe(64.5);
    });

    it('never silently recalculates legacy historical orders', () => {
      // Historical orders only had `pickupCharge: 49.0` and no service fee or GST
      const legacyOrder = {
        orderNumber: 'JIO-LEGACY-001',
        pickupCharge: 49.0,
        actualTotal: 200.0,
        finalAmount: 151.0, // 200 - 49
        financialDirection: 'JUNKITOUT_PAYS',
      };

      const breakdown = getOrderTaxBreakdown(legacyOrder);
      // Historical logistics charge remains intact as pickupFee
      expect(breakdown.pickupFee).toBe(49.0);
      // Service fee and GST are 0 so historical numbers are untouched
      expect(breakdown.serviceFee).toBe(0.0);
      expect(breakdown.taxableAmount).toBe(0.0);
      expect(breakdown.gstAmount).toBe(0.0);
      expect(breakdown.totalFeeWithGst).toBe(49.0);
    });

    it('honors persisted invoice tax breakdown without recalculation', () => {
      const orderWithPersistedInvoice = {
        orderNumber: 'JIO-INV-001',
        invoices: [
          {
            invoiceNumber: 'INV-2026-001',
            pickupFee: 20.0,
            serviceFee: 30.0,
            gstRate: 0.18,
            gstAmount: 5.4,
          },
        ],
        address: { city: 'Bengaluru' },
      };

      const breakdown = getOrderTaxBreakdown(orderWithPersistedInvoice);
      expect(breakdown.pickupFee).toBe(20.0);
      expect(breakdown.serviceFee).toBe(30.0);
      expect(breakdown.gstAmount).toBe(5.4);
      expect(breakdown.totalFeeWithGst).toBe(55.4);
    });
  });

  describe('4. Receipt PDF Generation with GST Breakdown', () => {
    it('renders distinct pickup fee, service fee, and GST in generated PDF', () => {
      const orderWithGst = {
        id: 'ord-gst-pdf-1',
        orderNumber: 'JIO-20261106-GST001',
        status: 'PICKUP_COMPLETED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        actualTotal: 0,
        pickupFee: 40.0,
        serviceFee: 50.0,
        gstRate: 0.18,
        finalAmount: 99.0, // 40 + 50 + 9
        customer: {
          user: { name: 'Kiran Kumar', phone: '+91 9876543210' },
        },
        address: {
          houseNo: '#101',
          street: 'Indiranagar 100ft Rd',
          area: 'Indiranagar',
          city: 'Bengaluru',
          pincode: '560038',
        },
        items: [
          {
            id: 'it-1',
            category: { name: 'E-Waste' },
            actualWeight: 5.0,
            ratePerKg: 0,
            subtotal: 0,
          },
        ],
      };

      const pdfBytes = generateReceiptPdfBytes(orderWithGst);
      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(1000);

      const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(pdfBytes);

      // Verify PDF 1.4 integrity
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText.includes('%%EOF')).toBe(true);

      // Verify GST and distinct fee line items in PDF (parentheses are escaped in PDF stream literal syntax)
      expect(pdfText).toContain('FINANCIAL VALUATION, TAX');
      expect(pdfText).toContain('Doorstep Pickup Fee');
      expect(pdfText).toContain('Service Fee');
      expect(pdfText).toContain('GST \\(18% CGST+SGST\\)');
      expect(pdfText).toContain('Total Fee with GST');
      expect(pdfText).toContain('Rs. 40.00'); // Pickup fee
      expect(pdfText).toContain('Rs. 50.00'); // Service fee
      expect(pdfText).toContain('Rs. 99.00'); // Final amount payable
    });

    it('renders inter-state IGST in PDF when customer is outside Karnataka', () => {
      const interStateOrder = {
        id: 'ord-igst-pdf-2',
        orderNumber: 'JIO-20261106-IGST002',
        status: 'PICKUP_COMPLETED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        pickupFee: 30.0,
        serviceFee: 50.0,
        gstRate: 0.18,
        finalAmount: 89.0,
        customer: {
          user: { name: 'Venkatesh Rao', phone: '+91 9876543211' },
        },
        address: {
          area: 'Anna Nagar',
          city: 'Chennai',
          pincode: '600040',
        },
      };

      const pdfBytes = generateReceiptPdfBytes(interStateOrder);
      const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(pdfBytes);

      expect(pdfText).toContain('GST \\(18% IGST\\)');
    });
  });

  describe('5. Financial Reconciliation and Refund Safety', () => {
    it('verifies Subtotal = pickupFee + serviceFee across random pricing variations', () => {
      const testCases = [
        { pickup: 0, service: 0 },
        { pickup: 50, service: 0 },
        { pickup: 0, service: 49 },
        { pickup: 49, service: 29 },
        { pickup: 100, service: 150 },
        { pickup: 12.34, service: 56.78 },
      ];

      for (const tc of testCases) {
        const result = calculateTaxBreakdown({
          pickupFee: tc.pickup,
          serviceFee: tc.service,
        });

        const expectedSubtotal = Math.round((tc.pickup + tc.service) * 100) / 100;
        const expectedTaxable = Math.round(tc.service * 100) / 100;
        const expectedGst = Math.round(expectedTaxable * DEFAULT_GST_RATE * 100) / 100;
        const expectedTotal = Math.round((expectedSubtotal + expectedGst) * 100) / 100;

        expect(result.subtotal).toBe(expectedSubtotal);
        expect(result.taxableAmount).toBe(expectedTaxable);
        expect(result.gstAmount).toBe(expectedGst);
        expect(result.totalFeeWithGst).toBe(expectedTotal);
      }
    });
  });
});
