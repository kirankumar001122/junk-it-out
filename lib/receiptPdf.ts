import { formatPickupAddress } from './address';
import { DEFAULT_SERVICE_CHARGE } from './geofence';
import { isPickupCompletedStatus } from './orders/lifecycle';
import { getOrderTaxBreakdown } from './pricing/tax';

export { getOrderTaxBreakdown };

/**
 * Escapes characters for PDF literal strings (WinAnsiEncoding / ASCII).
 * Replaces backslashes and parentheses, and converts non-ASCII characters to spaces.
 */
export function escapePdfText(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

/**
 * Format currency amount cleanly with Rs. prefix.
 */
export function formatPdfCurrency(amount: unknown): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return 'Rs. 0.00';
  return `Rs. ${num.toFixed(2)}`;
}

/**
 * Format date string for PDF display.
 */
export function formatPdfDate(dateInput: unknown): string {
  if (!dateInput) return 'N/A';
  try {
    const dt = new Date(dateInput as string | number | Date);
    if (isNaN(dt.getTime())) return String(dateInput);
    return dt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateInput);
  }
}

/**
 * Determines if an order is eligible for receipt download.
 * Returns true if the order has an invoice, is completed, has a settlement,
 * or has a successful/captured payment.
 */
export function isReceiptEligible(order: any): boolean {
  if (!order || typeof order !== 'object') return false;

  // 1. Explicit invoice generated
  if (Array.isArray(order.invoices) && order.invoices.length > 0) return true;

  // 2. Completed lifecycle status (PICKUP_COMPLETED, SETTLEMENT_COMPLETED)
  if (isPickupCompletedStatus(order.status)) return true;

  // 3. Settlement record exists
  if (order.settlement && typeof order.settlement === 'object') return true;

  // 4. Payment captured or succeeded
  const pmtStatus = String(order.paymentStatus || '').toUpperCase();
  if (pmtStatus === 'CAPTURED' || pmtStatus === 'PAID' || pmtStatus === 'SUCCESS') {
    return true;
  }

  // 5. Any payment in payments array is captured
  if (Array.isArray(order.payments) && order.payments.some((p: any) => String(p.status).toUpperCase() === 'CAPTURED')) {
    return true;
  }

  return false;
}

/**
 * Generate a clean, meaningful filename for the downloaded receipt PDF.
 * e.g., Receipt-JIO-20261014-OTX1VA.pdf or Receipt-ORDER_ID.pdf
 */
export function getReceiptFilename(order: any): string {
  const rawId = order?.orderNumber || order?.id || 'order';
  const cleanId = String(rawId)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  return `Receipt-${cleanId || 'order'}.pdf`;
}

/**
 * Generates valid, self-contained, publication-ready PDF 1.4 bytes for an Order Receipt.
 * Operates in both Node.js and web browsers with 0 external dependencies.
 */
export function generateReceiptPdfBytes(order: any): Uint8Array {
  if (!order || typeof order !== 'object') {
    throw new Error('Invalid order data provided for receipt generation.');
  }

  const stream: string[] = [];

  // Page dimensions (Standard ISO A4)
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 36;
  const contentWidth = pageWidth - (marginX * 2); // 523.28 pt

  // Start graphics context
  stream.push('q');

  // Background canvas (White)
  stream.push(`1 1 1 rg 0 0 ${pageWidth} ${pageHeight} re f`);

  // -------------------------------------------------------------
  // 1. TOP HEADER BANNER (Branding & Receipt Meta)
  // -------------------------------------------------------------
  const headerHeight = 52;
  const headerY = pageHeight - marginX - headerHeight; // 841.89 - 36 - 52 = 753.89

  // Header background (Emerald #059669 -> 0.02 0.59 0.41)
  stream.push(`0.02 0.59 0.41 rg ${marginX} ${headerY} ${contentWidth} ${headerHeight} re f`);

  // Company Name & Subtitle
  stream.push('1 1 1 rg');
  stream.push(`BT /F2 18 Tf ${marginX + 16} ${headerY + 28} Td (JUNK IT OUT) Tj ET`);
  stream.push(`BT /F1 8.5 Tf ${marginX + 16} ${headerY + 14} Td (DOORSTEP SCRAP COLLECTION & SUSTAINABLE RECYCLING) Tj ET`);

  // Receipt Number & Date Badge (Right-aligned in header)
  const invoiceNum = order.invoices?.[0]?.invoiceNumber || `REC-${order.orderNumber || String(order.id || '').slice(0, 8) || 'N/A'}`;
  const receiptDate = formatPdfDate(order.invoices?.[0]?.createdAt || order.createdAt || new Date());

  stream.push(`BT /F2 11 Tf 380 ${headerY + 28} Td (OFFICIAL RECEIPT) Tj ET`);
  stream.push(`BT /F1 8.5 Tf 380 ${headerY + 14} Td (No: ${escapePdfText(invoiceNum)}) Tj ET`);

  // -------------------------------------------------------------
  // 2. ORDER INFORMATION & CUSTOMER DETAILS (2-Column Card)
  // -------------------------------------------------------------
  let currentY = headerY - 14;
  const card1Height = 78;

  // Card background & subtle border
  stream.push(`0.97 0.98 0.99 rg ${marginX} ${currentY - card1Height} ${contentWidth} ${card1Height} re f`);
  stream.push(`0.89 0.91 0.94 RG 1 w ${marginX} ${currentY - card1Height} ${contentWidth} ${card1Height} re S`);

  // Card Title bar
  stream.push(`0.92 0.98 0.95 rg ${marginX} ${currentY - 18} ${contentWidth} 18 re f`);
  stream.push(`0.02 0.59 0.41 rg BT /F2 8.5 Tf ${marginX + 12} ${currentY - 13} Td (ORDER & CUSTOMER INFORMATION) Tj ET`);

  // Left Column (Order Number, Customer Name, Phone)
  const orderNum = order.orderNumber || order.id || 'N/A';
  const customerName = order.customer?.user?.name || order.customer?.name || 'Valued Customer';
  const customerPhone = order.customer?.user?.phone || order.phone || 'N/A';

  stream.push('0.39 0.45 0.55 rg'); // Slate 500 for labels
  stream.push(`BT /F1 8.5 Tf ${marginX + 12} ${currentY - 33} Td (Order ID / Number:) Tj ET`);
  stream.push(`BT /F1 8.5 Tf ${marginX + 12} ${currentY - 50} Td (Customer Name:) Tj ET`);
  stream.push(`BT /F1 8.5 Tf ${marginX + 12} ${currentY - 67} Td (Contact Phone:) Tj ET`);

  stream.push('0.06 0.09 0.16 rg'); // Slate 900 for values
  stream.push(`BT /F2 8.5 Tf ${marginX + 95} ${currentY - 33} Td (${escapePdfText(orderNum)}) Tj ET`);
  stream.push(`BT /F2 8.5 Tf ${marginX + 95} ${currentY - 50} Td (${escapePdfText(customerName)}) Tj ET`);
  stream.push(`BT /F1 8.5 Tf ${marginX + 95} ${currentY - 67} Td (${escapePdfText(customerPhone)}) Tj ET`);

  // Right Column (Pickup Schedule, Status, Assigned Agent)
  const pickupSlot = order.scheduledSlot || (order.pickupType === 'ASAP' ? '20-30 Mins ASAP' : (order.scheduledDate ? `${order.scheduledDate} ${order.timeSlot || ''}` : 'Standard Doorstep'));
  const orderStatus = isPickupCompletedStatus(order.status) ? 'Pickup Completed' : (order.status ? String(order.status).replace(/_/g, ' ') : 'Completed');
  const agentName = order.agent?.user?.name
    ? `${order.agent.user.name}${order.agent.vehicleType ? ` (${order.agent.vehicleType})` : ''}`
    : 'Junk It Out Field Team';

  stream.push('0.39 0.45 0.55 rg');
  stream.push(`BT /F1 8.5 Tf 305 ${currentY - 33} Td (Pickup Schedule:) Tj ET`);
  stream.push(`BT /F1 8.5 Tf 305 ${currentY - 50} Td (Pickup Status:) Tj ET`);
  stream.push(`BT /F1 8.5 Tf 305 ${currentY - 67} Td (Assigned Agent:) Tj ET`);

  stream.push('0.06 0.09 0.16 rg');
  stream.push(`BT /F2 8.5 Tf 385 ${currentY - 33} Td (${escapePdfText(pickupSlot)}) Tj ET`);
  stream.push(`0.02 0.59 0.41 rg BT /F2 8.5 Tf 385 ${currentY - 50} Td (${escapePdfText(orderStatus)}) Tj ET`);
  stream.push(`0.06 0.09 0.16 rg BT /F1 8.5 Tf 385 ${currentY - 67} Td (${escapePdfText(agentName)}) Tj ET`);

  currentY -= card1Height + 10;

  // -------------------------------------------------------------
  // 3. PICKUP LOCATION SECTION
  // -------------------------------------------------------------
  const addressLine = formatPickupAddress(order.address) || 'Service Area Address, Bengaluru';
  const addressCardHeight = 40;

  stream.push(`0.97 0.98 0.99 rg ${marginX} ${currentY - addressCardHeight} ${contentWidth} ${addressCardHeight} re f`);
  stream.push(`0.89 0.91 0.94 RG 1 w ${marginX} ${currentY - addressCardHeight} ${contentWidth} ${addressCardHeight} re S`);

  stream.push(`0.39 0.45 0.55 rg BT /F2 8 Tf ${marginX + 12} ${currentY - 14} Td (PICKUP LOCATION) Tj ET`);
  // Truncate address if excessively long to prevent overlap
  const cleanAddress = addressLine.length > 95 ? addressLine.slice(0, 92) + '...' : addressLine;
  stream.push(`0.06 0.09 0.16 rg BT /F1 8.5 Tf ${marginX + 12} ${currentY - 28} Td (${escapePdfText(cleanAddress)}) Tj ET`);

  currentY -= addressCardHeight + 12;

  // -------------------------------------------------------------
  // 4. WASTE DETAILS TABLE
  // -------------------------------------------------------------
  const rawItems = Array.isArray(order.items) && order.items.length > 0 ? order.items : [];
  const items = rawItems.slice(0, 8); // Safely fit on single page
  const tableHeaderHeight = 22;
  const rowHeight = 20;

  // Table header background (Slate 800)
  stream.push(`0.12 0.16 0.24 rg ${marginX} ${currentY - tableHeaderHeight} ${contentWidth} ${tableHeaderHeight} re f`);
  stream.push('1 1 1 rg');
  stream.push(`BT /F2 8.5 Tf ${marginX + 10} ${currentY - 15} Td (SCRAP ITEM / CATEGORY) Tj ET`);
  stream.push(`BT /F2 8.5 Tf 250 ${currentY - 15} Td (RECORDED WEIGHT) Tj ET`);
  stream.push(`BT /F2 8.5 Tf 370 ${currentY - 15} Td (RATE / KG) Tj ET`);
  stream.push(`BT /F2 8.5 Tf 465 ${currentY - 15} Td (AMOUNT) Tj ET`);

  currentY -= tableHeaderHeight;

  let computedTotalWeight = 0;
  if (items.length === 0) {
    // Empty row placeholder
    stream.push(`1 1 1 rg ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re f`);
    stream.push(`0.89 0.91 0.94 RG 0.5 w ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re S`);
    stream.push('0.39 0.45 0.55 rg');
    stream.push(`BT /F1 8.5 Tf ${marginX + 10} ${currentY - 14} Td (Doorstep Scrap Collection - General Recycling) Tj ET`);
    stream.push(`BT /F1 8.5 Tf 250 ${currentY - 14} Td (Standard) Tj ET`);
    stream.push(`BT /F1 8.5 Tf 370 ${currentY - 14} Td (-) Tj ET`);
    stream.push(`BT /F2 8.5 Tf 465 ${currentY - 14} Td (${formatPdfCurrency(order.actualTotal || order.finalAmount || 0)}) Tj ET`);
    currentY -= rowHeight;
  } else {
    items.forEach((item: any, idx: number) => {
      const isEven = idx % 2 === 0;
      const bgCol = isEven ? '1 1 1' : '0.97 0.98 0.99';
      stream.push(`${bgCol} rg ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re f`);
      stream.push(`0.89 0.91 0.94 RG 0.5 w ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re S`);

      const itemName = item.category?.name || item.name || 'Waste Item';
      const weightNum = typeof item.actualWeight === 'number'
        ? item.actualWeight
        : (typeof item.estimatedWeight === 'number' ? item.estimatedWeight : 0);
      computedTotalWeight += weightNum;

      const rateNum = typeof item.ratePerKg === 'number'
        ? item.ratePerKg
        : (typeof item.pricePerKg === 'number' ? item.pricePerKg : 0);

      const subtotalNum = typeof item.subtotal === 'number'
        ? item.subtotal
        : (weightNum * rateNum);

      stream.push('0.06 0.09 0.16 rg');
      stream.push(`BT /F2 8.5 Tf ${marginX + 10} ${currentY - 14} Td (${escapePdfText(itemName)}) Tj ET`);
      stream.push(`BT /F1 8.5 Tf 250 ${currentY - 14} Td (${weightNum.toFixed(2)} kg) Tj ET`);
      stream.push(`BT /F1 8.5 Tf 370 ${currentY - 14} Td (${formatPdfCurrency(rateNum)}/kg) Tj ET`);
      stream.push(`BT /F2 8.5 Tf 465 ${currentY - 14} Td (${formatPdfCurrency(subtotalNum)}) Tj ET`);

      currentY -= rowHeight;
    });
  }

  // If there were more than 8 items, show notice row
  if (rawItems.length > 8) {
    const extra = rawItems.length - 8;
    stream.push(`0.97 0.98 0.99 rg ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re f`);
    stream.push(`0.89 0.91 0.94 RG 0.5 w ${marginX} ${currentY - rowHeight} ${contentWidth} ${rowHeight} re S`);
    stream.push('0.39 0.45 0.55 rg');
    stream.push(`BT /F1 8 Tf ${marginX + 10} ${currentY - 14} Td (+ ${extra} additional measured scrap items) Tj ET`);
    currentY -= rowHeight;
  }

  // Total Weight Summary Row
  const recordedTotalWeight = typeof order.settlement?.totalWeightKg === 'number'
    ? order.settlement.totalWeightKg
    : (typeof order.totalWeightKg === 'number' ? order.totalWeightKg : computedTotalWeight);

  const totalRowHeight = 22;
  stream.push(`0.95 0.96 0.98 rg ${marginX} ${currentY - totalRowHeight} ${contentWidth} ${totalRowHeight} re f`);
  stream.push(`0.89 0.91 0.94 RG 1 w ${marginX} ${currentY - totalRowHeight} ${contentWidth} ${totalRowHeight} re S`);
  stream.push('0.12 0.16 0.24 rg');
  stream.push(`BT /F2 8.5 Tf ${marginX + 10} ${currentY - 15} Td (TOTAL MEASURED SCRAP WEIGHT) Tj ET`);
  stream.push(`BT /F2 8.5 Tf 250 ${currentY - 15} Td (${recordedTotalWeight.toFixed(2)} kg) Tj ET`);

  currentY -= totalRowHeight + 14;

  // -------------------------------------------------------------
  // 5. FINANCIAL VALUATION & SETTLEMENT BREAKDOWN
  // -------------------------------------------------------------
  const scrapValuation = typeof order.actualTotal === 'number'
    ? order.actualTotal
    : (typeof order.totalValuation === 'number' ? order.totalValuation : (typeof order.estimatedTotal === 'number' ? order.estimatedTotal : 0));

  const tax = getOrderTaxBreakdown(order);

  const isBookingPaid = order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS';
  const isJunkItOutPays = order.financialDirection === 'JUNKITOUT_PAYS';

  const finalAmount = typeof order.finalAmount === 'number'
    ? order.finalAmount
    : (typeof order.settlement?.amount === 'number' ? order.settlement.amount : 0);

  const finBoxHeight = 124;
  stream.push(`0.97 0.98 0.99 rg ${marginX} ${currentY - finBoxHeight} ${contentWidth} ${finBoxHeight} re f`);
  stream.push(`0.89 0.91 0.94 RG 1 w ${marginX} ${currentY - finBoxHeight} ${contentWidth} ${finBoxHeight} re S`);

  // Financial Header Banner
  stream.push(`0.92 0.98 0.95 rg ${marginX} ${currentY - 18} ${contentWidth} 18 re f`);
  stream.push(`0.02 0.59 0.41 rg BT /F2 8.5 Tf ${marginX + 12} ${currentY - 13} Td (FINANCIAL VALUATION, TAX & SETTLEMENT BREAKDOWN) Tj ET`);

  // Left Sub-column (Valuation Breakdown)
  stream.push('0.39 0.45 0.55 rg');
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 32} Td (Scrap Material Valuation:) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 48} Td (Doorstep Pickup Fee (Non-taxable):) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 64} Td (Service Fee (Taxable base):) Tj ET`);
  const gstLabel = tax.isInterState
    ? `GST (${tax.gstRatePercent}% IGST):`
    : `GST (${tax.gstRatePercent}% CGST+SGST):`;
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 80} Td (${escapePdfText(gstLabel)}) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 96} Td (Total Fee with GST:) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 112} Td (Booking Payment Status:) Tj ET`);

  stream.push('0.06 0.09 0.16 rg');
  stream.push(`BT /F2 8 Tf 185 ${currentY - 32} Td (${formatPdfCurrency(scrapValuation)}) Tj ET`);
  stream.push(`BT /F2 8 Tf 185 ${currentY - 48} Td (${formatPdfCurrency(tax.pickupFee)}) Tj ET`);
  stream.push(`BT /F2 8 Tf 185 ${currentY - 64} Td (${formatPdfCurrency(tax.serviceFee)}) Tj ET`);
  const gstValueStr = tax.gstAmount > 0
    ? (tax.isInterState
        ? `${formatPdfCurrency(tax.igstAmount)}`
        : `C:${formatPdfCurrency(tax.cgstAmount)} + S:${formatPdfCurrency(tax.sgstAmount)}`)
    : formatPdfCurrency(0);
  stream.push(`BT /F2 8 Tf 185 ${currentY - 80} Td (${escapePdfText(gstValueStr)}) Tj ET`);
  stream.push(`BT /F2 8 Tf 185 ${currentY - 96} Td (${formatPdfCurrency(tax.totalFeeWithGst)}) Tj ET`);
  const bookingPaymentLabel = isBookingPaid ? 'Paid at booking (Captured)' : 'Pending / Not Captured';
  stream.push(`BT /F1 8 Tf 185 ${currentY - 112} Td (${escapePdfText(bookingPaymentLabel)}) Tj ET`);

  // Right Sub-column (Final Result Card)
  const resultCardX = 300;
  const resultCardW = 210;
  const resultCardH = 74;
  const resultCardY = currentY - 26 - resultCardH;

  if (isJunkItOutPays) {
    // Green highlight card for customer payout
    stream.push(`0.92 0.98 0.95 rg ${resultCardX} ${resultCardY} ${resultCardW} ${resultCardH} re f`);
    stream.push(`0.02 0.59 0.41 RG 1.5 w ${resultCardX} ${resultCardY} ${resultCardW} ${resultCardH} re S`);

    stream.push('0.02 0.59 0.41 rg');
    stream.push(`BT /F2 8 Tf ${resultCardX + 12} ${resultCardY + 56} Td (CUSTOMER PAYOUT AMOUNT) Tj ET`);
    stream.push(`BT /F1 7.5 Tf ${resultCardX + 12} ${resultCardY + 44} Td (Junk It Out pays the customer) Tj ET`);
    stream.push(`BT /F2 15 Tf ${resultCardX + 12} ${resultCardY + 24} Td (${formatPdfCurrency(finalAmount)}) Tj ET`);

    const settStatus = order.settlement?.status || 'PENDING';
    const settLabel = settStatus === 'PAID' || settStatus === 'SETTLEMENT_COMPLETED'
      ? 'Settlement Completed'
      : settStatus === 'READY_FOR_PAYOUT'
        ? 'Approved for Payout'
        : 'Payout Pending / In Review';
    stream.push(`0.39 0.45 0.55 rg BT /F1 7.5 Tf ${resultCardX + 12} ${resultCardY + 9} Td (Settlement: ${escapePdfText(settLabel)}) Tj ET`);
  } else {
    // Customer pays Junk It Out
    stream.push(`0.95 0.96 0.98 rg ${resultCardX} ${resultCardY} ${resultCardW} ${resultCardH} re f`);
    stream.push(`0.12 0.16 0.24 RG 1.5 w ${resultCardX} ${resultCardY} ${resultCardW} ${resultCardH} re S`);

    stream.push('0.12 0.16 0.24 rg');
    stream.push(`BT /F2 8 Tf ${resultCardX + 12} ${resultCardY + 56} Td (CUSTOMER AMOUNT PAYABLE) Tj ET`);
    stream.push(`BT /F1 7.5 Tf ${resultCardX + 12} ${resultCardY + 44} Td (Customer pays Junk It Out) Tj ET`);
    stream.push(`BT /F2 15 Tf ${resultCardX + 12} ${resultCardY + 24} Td (${formatPdfCurrency(finalAmount)}) Tj ET`);

    const pmtStatus = order.paymentStatus || 'CAPTURED';
    stream.push(`0.39 0.45 0.55 rg BT /F1 7.5 Tf ${resultCardX + 12} ${resultCardY + 9} Td (Payment Status: ${escapePdfText(pmtStatus)}) Tj ET`);
  }

  currentY -= finBoxHeight + 12;

  // -------------------------------------------------------------
  // 6. PAYMENT & TRANSACTION RECORD
  // -------------------------------------------------------------
  const payment = Array.isArray(order.payments) && order.payments.length > 0 ? order.payments[0] : null;
  const txnId = payment?.gatewayPaymentId || payment?.gatewayOrderId || payment?.id || order.paymentId || 'N/A';
  const paymentMethod = payment?.gateway === 'RAZORPAY'
    ? 'Razorpay Secure (UPI / Cards / NetBanking)'
    : 'Doorstep Digital / Direct Settlement';
  const paymentDate = formatPdfDate(payment?.capturedAt || payment?.createdAt || order.createdAt);

  const txnCardHeight = 48;
  stream.push(`0.97 0.98 0.99 rg ${marginX} ${currentY - txnCardHeight} ${contentWidth} ${txnCardHeight} re f`);
  stream.push(`0.89 0.91 0.94 RG 1 w ${marginX} ${currentY - txnCardHeight} ${contentWidth} ${txnCardHeight} re S`);

  stream.push('0.39 0.45 0.55 rg');
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 16} Td (Transaction / Gateway ID:) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 12} ${currentY - 32} Td (Payment Method & Date:) Tj ET`);

  stream.push('0.06 0.09 0.16 rg');
  stream.push(`BT /F2 8 Tf ${marginX + 135} ${currentY - 16} Td (${escapePdfText(txnId)}) Tj ET`);
  stream.push(`BT /F1 8 Tf ${marginX + 135} ${currentY - 32} Td (${escapePdfText(paymentMethod)} | ${escapePdfText(paymentDate)}) Tj ET`);

  currentY -= txnCardHeight + 14;

  // -------------------------------------------------------------
  // 7. FOOTER & COMPLIANCE NOTES
  // -------------------------------------------------------------
  stream.push(`0.89 0.91 0.94 RG 0.5 w ${marginX} ${currentY} ${contentWidth} 0 re S`); // Divider

  stream.push('0.39 0.45 0.55 rg');
  stream.push(`BT /F2 8.5 Tf ${marginX} ${currentY - 14} Td (Thank you for choosing Junk It Out.) Tj ET`);
  stream.push(`BT /F1 7.5 Tf ${marginX} ${currentY - 26} Td (This electronic receipt reflects the actual waste weight recorded during doorstep pickup.) Tj ET`);
  stream.push(`BT /F1 7.5 Tf ${marginX} ${currentY - 38} Td (DPIIT Registered Startup | Bangalore, Karnataka | Support: support@junkitout.in) Tj ET`);

  stream.push(`BT /F2 7.5 Tf 410 ${currentY - 14} Td (Verified Digital Receipt) Tj ET`);
  stream.push(`BT /F1 7 Tf 410 ${currentY - 26} Td (Receipt Date: ${escapePdfText(receiptDate)}) Tj ET`);
  stream.push(`BT /F1 6.5 Tf 410 ${currentY - 38} Td (Computer generated - no signature required) Tj ET`);

  // End graphics
  stream.push('Q');

  const contentStream = stream.join('\n');
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(contentStream);
  const streamLength = streamBytes.length;

  // PDF 1.4 Object definitions
  const o1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const o2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const o3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`;
  const o4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const o5 = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const o6 = `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`;

  const header = `%PDF-1.4\n%${String.fromCharCode(181, 182, 183, 184)}\n`;
  const allObjects = [o1, o2, o3, o4, o5, o6];

  let body = '';
  const offsets: number[] = [0];

  let currentOffset = encoder.encode(header).length;
  for (const objStr of allObjects) {
    offsets.push(currentOffset);
    body += objStr;
    currentOffset += encoder.encode(objStr).length;
  }

  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${allObjects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= allObjects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${allObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const fullPdf = header + body + xref + trailer;
  return encoder.encode(fullPdf);
}

/**
 * Browser-only helper to trigger direct PDF download without page navigation or new tabs.
 */
export function downloadReceiptPdf(order: any, customFilename?: string): void {
  if (typeof window === 'undefined') {
    throw new Error('downloadReceiptPdf can only be executed in browser environments.');
  }

  const pdfBytes = generateReceiptPdfBytes(order);
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const filename = customFilename || getReceiptFilename(order);

  // Create virtual download anchor
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = blobUrl;
  link.download = filename;

  document.body.appendChild(link);
  link.click();

  // Safely clean up DOM and object URL
  window.setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    window.URL.revokeObjectURL(blobUrl);
  }, 1500);
}
