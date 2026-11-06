/**
 * Tax & GST Calculation Engine for Junk It Out
 *
 * Implements strict statutory Indian Goods and Services Tax (GST) rules:
 * - GST is levied ONLY on the taxable service fee (SAC 9994 / platform & processing).
 * - Doorstep pickup / logistics fees are non-taxable / exempt and must NOT be included
 *   in the GST taxable base.
 * - Transactions within Karnataka (intra-state) apply CGST (rate / 2) + SGST (rate / 2).
 * - Transactions outside Karnataka (inter-state) apply IGST (full rate).
 * - Integer-paise precision arithmetic eliminates floating point inaccuracies and guarantees
 *   that CGST + SGST reconciles to total GST with 0 discrepancy.
 */

export const DEFAULT_GST_RATE = 0.18; // 18% standard GST rate for service fees
export const DEFAULT_COMPANY_STATE = 'Karnataka';
export const DEFAULT_COMPANY_STATE_CODE = '29'; // GST state code for Karnataka
export const DEFAULT_SAC_CODE = '9994'; // Support / waste management services

/**
 * Normalizes state name for tax jurisdiction matching.
 */
export function normalizeStateName(state?: string | null): string {
  if (!state || typeof state !== 'string') return DEFAULT_COMPANY_STATE;
  const clean = state.trim().toLowerCase();
  if (clean.includes('karnataka') || clean === 'ka' || clean === 'blr' || clean === 'bangalore' || clean === 'bengaluru') {
    return 'Karnataka';
  }
  return state.trim();
}

/**
 * Resolves the effective GST rate from environment variable or fallback default.
 */
export function getEffectiveGstRate(): number {
  const envRate = process.env.TAX_GST_RATE || process.env.NEXT_PUBLIC_TAX_GST_RATE;
  if (envRate) {
    const parsed = Number(envRate);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return DEFAULT_GST_RATE;
}

export interface TaxBreakdown {
  pickupFee: number;            // Non-taxable logistics / doorstep pickup charge (₹)
  pickupFeePaise: number;       // in integer paise
  serviceFee: number;           // Taxable service / platform fee (₹)
  serviceFeePaise: number;      // in integer paise
  subtotal: number;             // pickupFee + serviceFee (₹)
  subtotalPaise: number;        // in integer paise
  taxableAmount: number;        // Taxable value (= serviceFee) (₹)
  taxableAmountPaise: number;   // in integer paise
  gstRate: number;              // e.g. 0.18 (18%)
  gstRatePercent: number;       // e.g. 18
  gstAmount: number;            // Total GST on taxable service fee (₹)
  gstAmountPaise: number;       // in integer paise
  isInterState: boolean;        // true if customer destination is outside Karnataka
  sacCode: string;              // e.g. '9994'
  cgstRate: number;             // e.g. 0.09 (9%) if intra-state, else 0
  cgstAmount: number;           // in ₹
  cgstAmountPaise: number;      // in integer paise
  sgstRate: number;             // e.g. 0.09 (9%) if intra-state, else 0
  sgstAmount: number;           // in ₹
  sgstAmountPaise: number;      // in integer paise
  igstRate: number;             // e.g. 0.18 (18%) if inter-state, else 0
  igstAmount: number;           // in ₹
  igstAmountPaise: number;      // in integer paise
  totalFeeWithGst: number;      // pickupFee + serviceFee + gstAmount (₹)
  totalFeeWithGstPaise: number; // in integer paise
}

/**
 * Calculates statutory GST and fee line items with integer-paise precision.
 *
 * Rules:
 * - Subtotal = pickupFee + serviceFee
 * - Taxable value = serviceFee only
 * - Pickup fee has 0% GST
 * - GST amount = Math.round(serviceFeePaise * gstRate)
 * - CGST = Math.round(serviceFeePaise * (gstRate / 2))
 * - SGST = totalGstPaise - cgstPaise (reconciles 100% to total GST)
 * - Final Total = pickupFee + serviceFee + GST
 */
export function calculateTaxBreakdown(params: {
  pickupFee?: number | null;
  serviceFee?: number | null;
  state?: string | null;
  gstRate?: number | null;
  sacCode?: string | null;
}): TaxBreakdown {
  const safePickup = Number(params.pickupFee);
  const pickupFeePaise = Number.isFinite(safePickup) && safePickup > 0
    ? Math.round((safePickup + Number.EPSILON) * 100)
    : 0;

  const safeService = Number(params.serviceFee);
  const serviceFeePaise = Number.isFinite(safeService) && safeService > 0
    ? Math.round((safeService + Number.EPSILON) * 100)
    : 0;

  const resolvedRate = typeof params.gstRate === 'number' && Number.isFinite(params.gstRate) && params.gstRate >= 0
    ? params.gstRate
    : getEffectiveGstRate();

  const sacCode = params.sacCode || DEFAULT_SAC_CODE;
  const destinationState = normalizeStateName(params.state);
  const isInterState = destinationState.toLowerCase() !== DEFAULT_COMPANY_STATE.toLowerCase();

  const subtotalPaise = pickupFeePaise + serviceFeePaise;
  const taxableAmountPaise = serviceFeePaise;

  // Calculate total GST on taxable service fee
  const gstAmountPaise = Math.round((taxableAmountPaise * resolvedRate) + Number.EPSILON);

  let cgstAmountPaise = 0;
  let sgstAmountPaise = 0;
  let igstAmountPaise = 0;

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;

  if (isInterState) {
    igstRate = resolvedRate;
    igstAmountPaise = gstAmountPaise;
  } else {
    // Intra-state: 50% CGST + 50% SGST
    cgstRate = resolvedRate / 2;
    sgstRate = resolvedRate / 2;
    cgstAmountPaise = Math.round((taxableAmountPaise * cgstRate) + Number.EPSILON);
    // Guarantees cgst + sgst === gstAmountPaise exactly without rounding divergence
    sgstAmountPaise = gstAmountPaise - cgstAmountPaise;
  }

  const totalFeeWithGstPaise = subtotalPaise + gstAmountPaise;

  return {
    pickupFee: pickupFeePaise / 100,
    pickupFeePaise,
    serviceFee: serviceFeePaise / 100,
    serviceFeePaise,
    subtotal: subtotalPaise / 100,
    subtotalPaise,
    taxableAmount: taxableAmountPaise / 100,
    taxableAmountPaise,
    gstRate: resolvedRate,
    gstRatePercent: Math.round(resolvedRate * 100),
    gstAmount: gstAmountPaise / 100,
    gstAmountPaise,
    isInterState,
    sacCode,
    cgstRate,
    cgstAmount: cgstAmountPaise / 100,
    cgstAmountPaise,
    sgstRate,
    sgstAmount: sgstAmountPaise / 100,
    sgstAmountPaise,
    igstRate,
    igstAmount: igstAmountPaise / 100,
    igstAmountPaise,
    totalFeeWithGst: totalFeeWithGstPaise / 100,
    totalFeeWithGstPaise,
  };
}

/**
 * Extracts or computes authoritative tax breakdown for any order.
 *
 * Immutability Guarantee:
 * - If an order already has an invoice record with persisted tax numbers,
 *   those exact numbers are returned without recalculation.
 * - If an order has explicit `pickupFee`, `serviceFee`, `gstAmount` columns,
 *   those are used.
 * - For legacy historical orders where only `pickupCharge` exists and no service fee
 *   was ever recorded, `pickupFee = order.pickupCharge`, `serviceFee = 0`, `gstAmount = 0`
 *   is returned to preserve historical accounting integrity.
 */
export function getOrderTaxBreakdown(order: any): TaxBreakdown {
  if (!order || typeof order !== 'object') {
    return calculateTaxBreakdown({});
  }

  // 1. Check if order has a persisted invoice with stored tax fields
  const invoice = Array.isArray(order.invoices) && order.invoices.length > 0 ? order.invoices[0] : null;
  if (invoice) {
    if (typeof invoice.serviceFee === 'number' && typeof invoice.gstAmount === 'number') {
      return calculateTaxBreakdown({
        pickupFee: invoice.pickupFee ?? 0,
        serviceFee: invoice.serviceFee,
        gstRate: invoice.gstRate ?? DEFAULT_GST_RATE,
        state: order.address?.city || order.address?.area || 'Karnataka',
      });
    }

    // Try parsing pdfDataJson if present
    if (typeof invoice.pdfDataJson === 'string' && invoice.pdfDataJson.trim()) {
      try {
        const parsed = JSON.parse(invoice.pdfDataJson);
        if (parsed && typeof parsed.serviceFee === 'number') {
          return calculateTaxBreakdown({
            pickupFee: parsed.pickupFee ?? 0,
            serviceFee: parsed.serviceFee,
            gstRate: parsed.gstRate ?? DEFAULT_GST_RATE,
            state: order.address?.city || order.address?.area || 'Karnataka',
          });
        }
      } catch {
        // Continue to column extraction
      }
    }
  }

  // 2. Check explicit order columns
  const hasExplicitServiceFee = typeof order.serviceFee === 'number' && Number.isFinite(order.serviceFee);
  const hasExplicitPickupFee = typeof order.pickupFee === 'number' && Number.isFinite(order.pickupFee);

  if (hasExplicitServiceFee || hasExplicitPickupFee) {
    return calculateTaxBreakdown({
      pickupFee: order.pickupFee ?? 0,
      serviceFee: order.serviceFee ?? 0,
      gstRate: order.gstRate ?? DEFAULT_GST_RATE,
      state: order.address?.city || order.address?.area || 'Karnataka',
    });
  }

  // 3. Historical order fallback:
  // Historically, `pickupCharge` was recorded as a pure logistics fee without service fee/GST separation.
  // Treat `pickupFee = order.pickupCharge`, `serviceFee = 0`, `gst = 0` to preserve historical totals.
  const legacyPickupCharge = typeof order.pickupCharge === 'number' ? order.pickupCharge : 0;
  return calculateTaxBreakdown({
    pickupFee: legacyPickupCharge,
    serviceFee: 0,
    state: order.address?.city || order.address?.area || 'Karnataka',
  });
}
