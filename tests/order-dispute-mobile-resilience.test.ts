import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitComplaint } from '../app/api/complaints/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'dispute-mobile-resilience-test-jwt-secret-32-chars';

function makeToken(role: 'CUSTOMER' | 'AGENT' | 'ADMIN', claims: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-user-id`,
    customerId: `${role.toLowerCase()}-customer-id`,
    phone: '9876543210',
    name: `${role} User`,
    role,
    tokenVersion: 1,
    ...claims,
  });
}

function makeReq(url: string, method: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Order Dispute & Mobile Resilience Test Suite', () => {
  const origOrderFindUnique = db.order.findUnique;
  const origComplaintCreate = (db as any).complaint?.create;

  afterEach(() => {
    db.order.findUnique = origOrderFindUnique;
    if ((db as any).complaint) {
      (db as any).complaint.create = origComplaintCreate;
    }
  });

  // --------------------------------------------------------------------------
  // 1. Backend Dispute Authorization & Validation (/api/complaints)
  // --------------------------------------------------------------------------
  describe('1. Backend Dispute Authorization & Validation', () => {
    it('rejects unauthenticated dispute submission on an order with 401', async () => {
      const req = makeReq('/api/complaints', 'POST', undefined, {
        orderId: 'order-123',
        category: 'WEIGHT_DISPUTE',
        description: 'Agent measured wrong weight on digital scale',
      });

      const res = await submitComplaint(req);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Authentication required/i);
    });

    it('rejects empty or whitespace dispute description with 400', async () => {
      const token = makeToken('CUSTOMER');
      const req = makeReq('/api/complaints', 'POST', token, {
        orderId: 'order-123',
        category: 'WEIGHT_DISPUTE',
        description: '   ',
      });

      const res = await submitComplaint(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /description is required/i);
    });

    it('rejects dispute submission if order does not exist with 404', async () => {
      const token = makeToken('CUSTOMER', { customerId: 'customer-me' });
      (db.order as any).findUnique = async () => null;

      const req = makeReq('/api/complaints', 'POST', token, {
        orderId: 'non-existent-order',
        category: 'WEIGHT_DISPUTE',
        description: 'Scale read 10kg instead of 15kg',
      });

      const res = await submitComplaint(req);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Order not found/i);
    });

    it('rejects dispute submission if customer does not own the order with 403', async () => {
      const token = makeToken('CUSTOMER', { customerId: 'customer-attacker' });
      (db.order as any).findUnique = async () => ({
        id: 'order-victim',
        customerId: 'customer-victim',
      });

      const req = makeReq('/api/complaints', 'POST', token, {
        orderId: 'order-victim',
        category: 'WEIGHT_DISPUTE',
        description: 'Unauthorized dispute attempt',
      });

      const res = await submitComplaint(req);
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /not authorized/i);
    });

    it('successfully creates WEIGHT_DISPUTE ticket for authorized customer with 200', async () => {
      const token = makeToken('CUSTOMER', { customerId: 'customer-101' });
      (db.order as any).findUnique = async () => ({
        id: 'order-101',
        customerId: 'customer-101',
      });

      let createdData: any = null;
      (db as any).complaint = {
        create: async (args: any) => {
          createdData = args.data;
          return { id: 'cmp-generated-1', ...args.data, createdAt: new Date() };
        },
      };

      const req = makeReq('/api/complaints', 'POST', token, {
        orderId: 'order-101',
        category: 'WEIGHT_DISPUTE',
        description: 'Digital scale indicated 12.5kg but agent logged 8.5kg on receipt.',
      });

      const res = await submitComplaint(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(createdData.orderId, 'order-101');
      assert.equal(createdData.customerId, 'customer-101');
      assert.equal(createdData.category, 'WEIGHT_DISPUTE');
      assert.equal(createdData.status, 'OPEN');
      assert.equal(createdData.description, 'Digital scale indicated 12.5kg but agent logged 8.5kg on receipt.');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Mobile Dispute UI Architecture & Accessibility Contract
  // --------------------------------------------------------------------------
  describe('2. Mobile Dispute UI Architecture & Accessibility Contract', () => {
    const pagePath = path.resolve(__dirname, '../app/orders/[id]/page.tsx');
    const pageSource = fs.readFileSync(pagePath, 'utf8');

    it('ensures Dispute button container uses responsive mobile-friendly layout', () => {
      // Must use flex-col on small screens to prevent title/button collision
      assert.ok(
        pageSource.includes('flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b'),
        'Waste Items & Weight Breakdown header must use responsive flex layout'
      );
      assert.ok(
        pageSource.includes('Dispute Weight / Report Issue'),
        'Dispute action button text must exist'
      );
      assert.ok(
        pageSource.includes('aria-haspopup="dialog"'),
        'Dispute button must declare aria-haspopup="dialog" for accessibility'
      );
    });

    it('ensures dispute modal container uses high stacking context z-[60] above Navbar (z-50) and BottomNav (z-40)', () => {
      assert.ok(
        pageSource.includes('role="dialog"'),
        'Dispute modal must have role="dialog"'
      );
      assert.ok(
        pageSource.includes('aria-modal="true"'),
        'Dispute modal must have aria-modal="true"'
      );
      assert.ok(
        pageSource.includes('aria-labelledby="dispute-dialog-title"'),
        'Dispute modal must reference its title via aria-labelledby'
      );
      assert.ok(
        pageSource.includes('fixed inset-0 z-[60]'),
        'Dispute modal must use z-[60] to sit above sticky Navbar and BottomNav'
      );
    });

    it('ensures modal container has overflow-y-auto and mobile safe-area padding', () => {
      assert.ok(
        pageSource.includes('overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom,0px))]'),
        'Dispute modal must support container scrolling and mobile safe area padding'
      );
    });

    it('ensures backdrop overlay is a separate sibling and does not blur modal card children', () => {
      // Sibling backdrop overlay ensures backdrop-blur applies only to page content behind, not child elements
      assert.ok(
        pageSource.includes("fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"),
        'Dispute modal must render a dedicated backdrop overlay'
      );
      assert.ok(
        pageSource.includes("onClick={() => !complaintSubmitting && setShowComplaintModal(false)}"),
        'Backdrop must dismiss modal when tapped by customer'
      );
    });

    it('ensures modal card has max-h, scrollability, and GPU compositing', () => {
      assert.ok(
        pageSource.includes('max-h-[calc(100dvh-2rem)] overflow-y-auto'),
        'Modal card must cap max-height and support internal scrolling'
      );
      assert.ok(
        pageSource.includes("style={{ transform: 'translateZ(0)' }}"),
        'Modal card must force hardware acceleration to avoid mobile WebKit blur bugs'
      );
    });

    it('provides accessible close button and labeled textarea', () => {
      assert.ok(
        pageSource.includes('aria-label="Close dialog"'),
        'Modal must include an accessible close button with aria-label'
      );
      assert.ok(
        pageSource.includes('id="dispute-dialog-title"'),
        'Modal heading must have id="dispute-dialog-title"'
      );
      assert.ok(
        pageSource.includes('htmlFor="dispute-reason-textarea"'),
        'Textarea must have an associated htmlFor label'
      );
      assert.ok(
        pageSource.includes('id="dispute-reason-textarea"'),
        'Textarea must have id="dispute-reason-textarea"'
      );
    });

    it('disables Submit Dispute button when textarea is empty or whitespace', () => {
      assert.ok(
        pageSource.includes('disabled={complaintSubmitting || !complaintText.trim()}'),
        'Submit button must be disabled when empty or in-flight'
      );
    });

    it('locks body scroll on modal open and restores it on close', () => {
      assert.ok(
        pageSource.includes('document.body.style.overflow = \'hidden\''),
        'Body scroll must be locked when modal is open'
      );
      assert.ok(
        pageSource.includes('document.body.style.overflow = originalOverflow'),
        'Body scroll must be restored when modal is closed'
      );
      assert.ok(
        pageSource.includes("e.key === 'Escape'"),
        'Escape key listener must close the complaint modal'
      );
    });

    it('includes inline complaintError display and complaintSuccess confirmation banner', () => {
      assert.ok(
        pageSource.includes('{complaintError && ('),
        'Must display inline complaintError banner inside modal'
      );
      assert.ok(
        pageSource.includes('{complaintSuccess && ('),
        'Must display complaintSuccess confirmation banner on order tracking page'
      );
    });
  });
});
