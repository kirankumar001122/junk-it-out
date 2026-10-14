'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatPickupAddress } from '@/lib/address';
import { isPickupCompletedStatus } from '@/lib/orders/lifecycle';

export default function ReceiptPage() {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<any>(null);
  const [unavailableOrder, setUnavailableOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Failed to load receipt');
        }

        if (!isPickupCompletedStatus(data.data.status)) {
          setUnavailableOrder(data.data);
          return;
        }

        setOrder(data.data);
      } catch (error: any) {
        setErrorMsg(error.message || 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchOrder();
    } else {
      setErrorMsg('A receipt order ID is required.');
      setLoading(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-600">Loading receipt...</p>
      </div>
    );
  }

  if (unavailableOrder) {
    const isCancelled = unavailableOrder.status === 'CANCELLED';
    const returnHref = isCancelled ? '/my-pickups' : `/orders/${unavailableOrder.id}`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Receipt not available yet</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {isCancelled
              ? 'This order was cancelled, so a pickup receipt is not available.'
              : `A receipt is available after pickup is complete. Current order status: ${String(unavailableOrder.status).replaceAll('_', ' ').toLowerCase()}.`}
          </p>
          <Link
            href={returnHref}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800"
          >
            {isCancelled ? 'Back to My Pickups' : 'Back to Order'}
          </Link>
        </section>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="max-w-md px-4 text-center">
          <p className="text-sm text-red-700" role="alert">
            {errorMsg || 'Receipt not found'}
          </p>
          <Link href="/my-pickups" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-emerald-800 underline">
            Back to My Pickups
          </Link>
        </div>
      </div>
    );
  }

  const invoice = order.invoices?.[0];

  const formatStatus = (status: string) => {
    switch (status) {
      case 'PICKUP_COMPLETED':
        return 'Pickup Completed';

      case 'SETTLEMENT_COMPLETED':
        return 'Settlement Completed';

      case 'BOOKING_RECEIVED':
        return 'Booking Received';

      case 'AGENT_ASSIGNED':
        return 'Agent Assigned';

      case 'AGENT_ACCEPTED':
        return 'Agent Accepted';

      case 'AGENT_ON_WAY':
        return 'Agent On Way';

      case 'AGENT_ARRIVED':
        return 'Agent Arrived';

      case 'WEIGHING':
        return 'Weighing';

      case 'CANCELLED':
        return 'Cancelled';

      case 'PENDING':
        return 'Pending';

      default:
        return (
          status
            ?.replaceAll('_', ' ')
            ?.toLowerCase()
            ?.replace(/\b\w/g, (char: string) => char.toUpperCase()) ||
          'N/A'
        );
    }
  };

  const formatDate = (date: string) => {
    if (!date) return 'N/A';

    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: any) => {
    if (amount === null || amount === undefined || amount === '') return 'N/A';
    return `₹${Number(amount).toFixed(2)}`;
  };

  const hasRecordedTotalWeight = order.settlement?.totalWeightKg !== null && order.settlement?.totalWeightKg !== undefined;
  const allItemsHaveActualWeight = Array.isArray(order.items) && order.items.length > 0 &&
    order.items.every((item: any) => item.actualWeight !== null && item.actualWeight !== undefined);
  const totalWeight = hasRecordedTotalWeight
    ? Number(order.settlement.totalWeightKg)
    : allItemsHaveActualWeight
      ? order.items.reduce((total: number, item: any) => total + Number(item.actualWeight), 0)
      : null;

  const pickupAddress = formatPickupAddress(order.address);

  return (
    <div className="receipt-screen">
      {/* =========================================================
          RECEIPT
          ========================================================= */}
      <main className="receipt-container">

        {/* Header */}
        <header className="receipt-header">
          <div>
            <h1 className="company-name">
              JUNK IT <span>OUT</span>
            </h1>

            <p className="receipt-title">
              Pickup Receipt
            </p>
          </div>

          <div className="invoice-info">
            <div className="invoice-label">
              INVOICE
            </div>

            <div className="invoice-number">
              {invoice?.invoiceNumber || 'N/A'}
            </div>

            <div className="invoice-date">
              {formatDate(order.createdAt)}
            </div>
          </div>
        </header>

        {/* Order / Customer Information */}
        <section className="section">
          <div className="section-title">
            ORDER INFORMATION
          </div>

          <div className="info-grid">

            <div className="info-item">
              <span>Order Number</span>
              <strong>{order.orderNumber}</strong>
            </div>

            <div className="info-item">
              <span>Customer</span>
              <strong>
                {order.customer?.user?.name || 'Customer'}
              </strong>
            </div>

            <div className="info-item">
              <span>Pickup Date</span>
              <strong>
                  {order.scheduledSlot || 'N/A'}
              </strong>
            </div>

            <div className="info-item">
              <span>Pickup Status</span>
              <strong className="status-completed">
                {isPickupCompletedStatus(order.status) ? 'Pickup Completed' : formatStatus(order.status)}
              </strong>
            </div>

          </div>
        </section>

        {/* Pickup Address */}
        <section className="section compact-section">
          <div className="section-title">
            PICKUP LOCATION
          </div>

          <div className="address-box">
            {pickupAddress || 'Address not available'}
          </div>
        </section>

        {/* Waste Items */}
        <section className="section">
          <div className="section-title">
            WASTE DETAILS
          </div>

          <table className="items-table">
            <thead>
              <tr>
                <th className="item-column">
                  Item
                </th>

                <th>
                  Actual Weight
                </th>

                <th>
                  Rate / Kg
                </th>

                <th>
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              {order.items?.map((item: any) => (
                <tr key={item.id}>
                  <td className="item-name">
                    {item.category?.name || 'Waste Item'}
                  </td>

                  <td>
                    {item.actualWeight === null || item.actualWeight === undefined
                      ? 'N/A'
                      : `${item.actualWeight} kg`}
                  </td>

                  <td>
                    {formatAmount(item.ratePerKg)}
                  </td>

                  <td className="amount-cell">
                    {formatAmount(item.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Financial Summary */}
        <section className="section settlement-section">
          <div className="section-title">
            FINANCIAL SUMMARY
          </div>

          <div className="settlement-content">
            <div className="section-title">PICKUP VALUATION</div>

            <div className="settlement-row">
              <span>Total Actual Weight</span>
              <strong>{totalWeight === null ? 'N/A' : `${totalWeight} kg`}</strong>
            </div>

            <div className="final-amount-row">
              <span>FINAL RECORDED VALUATION</span>

              <strong>
                {formatAmount(order.finalAmount)}
              </strong>
            </div>

            <div className="section-title mt-5">PAYMENT / PAYOUT</div>

            {order.financialDirection === 'JUNKITOUT_PAYS' ? (
              <>
                <div className="settlement-row">
                  <span>Financial Direction</span>
                  <strong>Junk It Out pays the customer</strong>
                </div>

                {order.settlement && (
                  <div className="settlement-row">
                    <span>Payout Amount</span>
                    <strong>{formatAmount(order.settlement.amount)}</strong>
                  </div>
                )}

                <div className="settlement-row">
                  <span>Settlement Status</span>
                  <strong>
                    {order.settlement
                      ? formatStatus(order.settlement.status)
                      : 'Not recorded'}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div className="settlement-row">
                  <span>Financial Direction</span>
                  <strong>Customer pays Junk It Out</strong>
                </div>

                <div className="settlement-row">
                  <span>{order.paymentStatus === 'REFUND_REQUIRED' ? 'Refund Status' : 'Payment Status'}</span>
                  <strong>
                    {order.paymentStatus === 'REFUND_REQUIRED'
                      ? 'Review required; provider payment remains captured'
                      : formatStatus(order.paymentStatus || 'PENDING')}
                  </strong>
                </div>
              </>
            )}

          </div>
        </section>

        {/* Footer */}
        <footer className="receipt-footer">
          <div>
            <strong>Thank you for choosing Junk It Out.</strong>

            <p>
              This receipt reflects the actual waste weight
              recorded during pickup.
            </p>
          </div>

          <div className="footer-invoice">
            {invoice?.invoiceNumber || 'Invoice'}
          </div>
        </footer>

        {/* Browser Button */}
        <div className="receipt-actions">
          <button
            type="button"
            onClick={() => window.print()}
            className="print-button"
          >
            PRINT / SAVE RECEIPT
          </button>
        </div>

      </main>

      {/* =========================================================
          PRINT CSS
          ========================================================= */}
      <style jsx global>{`

        /* ================================
           SCREEN
           ================================ */

        .receipt-screen {
          min-height: 100vh;
          background: #f1f5f9;
          padding: 32px 16px;
          color: #0f172a;
        }

        .receipt-container {
          width: 100%;
          max-width: 850px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
        }

        /* ================================
           HEADER
           ================================ */

        .receipt-header {
          background: #0f172a;
          color: white;
          padding: 28px 32px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }

        .company-name {
          margin: 0;
          font-size: 24px;
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .company-name span {
          color: #34d399;
        }

        .receipt-title {
          margin: 6px 0 0;
          color: #cbd5e1;
          font-size: 13px;
        }

        .invoice-info {
          text-align: right;
        }

        .invoice-label {
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .invoice-number {
          margin-top: 4px;
          font-size: 13px;
          font-weight: 700;
        }

        .invoice-date {
          margin-top: 5px;
          color: #94a3b8;
          font-size: 11px;
        }

        /* ================================
           SECTIONS
           ================================ */

        .section {
          padding: 20px 32px;
          border-bottom: 1px solid #e2e8f0;
        }

        .compact-section {
          padding-top: 16px;
          padding-bottom: 16px;
        }

        .section-title {
          margin-bottom: 12px;
          color: #64748b;
          font-size: 10px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: 0.9px;
        }

        /* ================================
           INFORMATION GRID
           ================================ */

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 15px 32px;
        }

        .info-item span {
          display: block;
          color: #94a3b8;
          font-size: 10px;
          margin-bottom: 4px;
        }

        .info-item strong {
          display: block;
          color: #1e293b;
          font-size: 12px;
          line-height: 1.35;
        }

        .status-completed {
          color: #059669 !important;
        }

        /* ================================
           ADDRESS
           ================================ */

        .address-box {
          padding: 10px 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          color: #334155;
          font-size: 11px;
          line-height: 1.4;
        }

        /* ================================
           ITEMS TABLE
           ================================ */

        .items-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11px;
        }

        .items-table th {
          padding: 9px 10px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          border-bottom: 1px solid #e2e8f0;
          color: #475569;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          text-align: right;
        }

        .items-table th:first-child {
          text-align: left;
        }

        .items-table td {
          padding: 9px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #475569;
          text-align: right;
          vertical-align: middle;
        }

        .items-table .item-column {
          width: 46%;
        }

        .items-table .item-name {
          color: #1e293b;
          font-weight: 600;
          text-align: left;
        }

        .amount-cell {
          color: #0f172a !important;
          font-weight: 700;
        }

        /* ================================
           SETTLEMENT
           ================================ */

        .settlement-section {
          border-bottom: 0;
        }

        .settlement-content {
          max-width: 520px;
          margin-left: auto;
        }

        .settlement-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 6px 0;
          font-size: 11px;
        }

        .settlement-row span {
          color: #64748b;
        }

        .settlement-row strong {
          color: #1e293b;
          font-weight: 700;
          text-align: right;
        }

        .final-amount-row {
          margin-top: 10px;
          padding-top: 12px;
          border-top: 2px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .final-amount-row span {
          font-size: 12px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.4px;
        }

        .final-amount-row strong {
          font-size: 20px;
          font-weight: 800;
          color: #059669;
        }

        /* ================================
           FOOTER
           ================================ */

        .receipt-footer {
          padding: 16px 32px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .receipt-footer strong {
          display: block;
          color: #334155;
          font-size: 10px;
        }

        .receipt-footer p {
          margin: 3px 0 0;
          color: #94a3b8;
          font-size: 9px;
        }

        .footer-invoice {
          color: #94a3b8;
          font-size: 9px;
          white-space: nowrap;
        }

        /* ================================
           SCREEN PRINT BUTTON
           ================================ */

        .receipt-actions {
          padding: 16px 32px;
          border-top: 1px solid #e2e8f0;
          background: white;
        }

        .print-button {
          width: 100%;
          border: 0;
          border-radius: 10px;
          padding: 12px 16px;
          background: #0f172a;
          color: white;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .print-button:hover {
          background: #1e293b;
        }

        /* ================================
           MOBILE
           ================================ */

        @media (max-width: 640px) {
          .receipt-screen {
            padding: 12px 8px;
          }

          .receipt-container {
            border-radius: 10px;
          }

          .receipt-header {
            padding: 20px;
          }

          .section {
            padding: 16px 20px;
          }

          .receipt-footer {
            padding: 14px 20px;
          }

          .receipt-actions {
            padding: 14px 20px;
          }

          .info-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .items-table {
            font-size: 9px;
          }

          .items-table th,
          .items-table td {
            padding: 7px 5px;
          }

          .items-table .item-column {
            width: 42%;
          }
        }

        /* ================================
           PRINT / PDF
           ================================ */

        @media print {

          @page {
            size: A4 portrait;
            margin: 6mm;
          }

          html,
          body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          /*
           * Remove the normal application page appearance.
           */
          body {
            overflow: hidden !important;
          }

          /*
           * Hide everything by default.
           */
          body * {
            visibility: hidden !important;
          }

          /*
           * Make only the receipt visible.
           */
          .receipt-screen,
          .receipt-screen * {
            visibility: visible !important;
          }

          /*
           * Remove the receipt from normal document flow.
           * This prevents the parent application layout from
           * generating additional blank pages.
           */
          .receipt-screen {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            overflow: hidden !important;
          }

          .receipt-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;

            width: 100% !important;
            max-width: none !important;

            margin: 0 !important;
            padding: 0 !important;

            background: white !important;
            border: 1px solid #dbe2ea !important;
            border-radius: 0 !important;
            box-shadow: none !important;

            overflow: hidden !important;
          }

          /*
           * Hide the browser button from PDF/printing.
           */
          .receipt-actions {
            display: none !important;
          }

          /*
           * Compact A4 spacing.
           */
          .receipt-header {
            padding: 15px 20px !important;
          }

          .company-name {
            font-size: 20px !important;
          }

          .receipt-title {
            margin-top: 4px !important;
            font-size: 10px !important;
          }

          .invoice-label {
            font-size: 8px !important;
          }

          .invoice-number {
            font-size: 10px !important;
          }

          .invoice-date {
            font-size: 9px !important;
          }

          .section {
            padding: 11px 20px !important;
          }

          .compact-section {
            padding-top: 9px !important;
            padding-bottom: 9px !important;
          }

          .section-title {
            margin-bottom: 7px !important;
            font-size: 8px !important;
          }

          .info-grid {
            gap: 8px 25px !important;
          }

          .info-item span {
            font-size: 8px !important;
            margin-bottom: 2px !important;
          }

          .info-item strong {
            font-size: 9px !important;
          }

          .address-box {
            padding: 7px 9px !important;
            font-size: 9px !important;
          }

          .items-table {
            font-size: 9px !important;
          }

          .items-table th {
            padding: 6px 8px !important;
            font-size: 7px !important;
          }

          .items-table td {
            padding: 6px 8px !important;
          }

          .settlement-row {
            padding: 3px 0 !important;
            font-size: 9px !important;
          }

          .final-amount-row {
            margin-top: 6px !important;
            padding-top: 8px !important;
          }

          .final-amount-row span {
            font-size: 10px !important;
          }

          .final-amount-row strong {
            font-size: 16px !important;
          }

          .receipt-footer {
            padding: 9px 20px !important;
          }

          .receipt-footer strong {
            font-size: 8px !important;
          }

          .receipt-footer p {
            font-size: 7px !important;
          }

          .footer-invoice {
            font-size: 7px !important;
          }

          /*
           * Prevent sections from being split between pages.
           */
          .receipt-header,
          .section,
          .receipt-footer {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          /*
           * Prevent table rows from splitting.
           */
          .items-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
