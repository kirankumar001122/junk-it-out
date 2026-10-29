'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatPickupAddress } from '@/lib/address';
import { isPickupCompletedStatus } from '@/lib/orders/lifecycle';

export default function ReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || data.message || 'Failed to load receipt');
        }

        if (!isPickupCompletedStatus(data.data.status)) {
          if (data.data.status === 'CANCELLED') {
            router.replace('/my-pickups');
          } else {
            router.replace(`/orders/${data.data.id}`);
          }
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
    }
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-600">Loading receipt...</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-sm text-red-600">
          {errorMsg || 'Receipt not found'}
        </p>
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
            margin: 10mm 12mm;
          }

          *,
          *::before,
          *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Hide application chrome: Navbar, Footer, BottomNavs, Floating actions */
          header:not(.receipt-header),
          footer:not(.receipt-footer),
          nav,
          aside,
          .receipt-actions,
          button:not(.receipt-actions button) {
            display: none !important;
          }

          html,
          body {
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
            color: #0f172a !important;
            font-size: 11pt !important;
          }

          /* Unset any padding/margin added by RootLayout */
          main {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }

          .receipt-screen {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }

          .receipt-container {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            border: 1.5px solid #cbd5e1 !important;
            border-radius: 8px !important;
            box-shadow: none !important;
            overflow: visible !important;
          }

          .receipt-header {
            background: #0f172a !important;
            color: #ffffff !important;
            padding: 20px 24px !important;
            border-radius: 6px 6px 0 0 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            gap: 20px !important;
          }

          .company-name {
            font-size: 22px !important;
            color: #ffffff !important;
            font-weight: 800 !important;
            line-height: 1.1 !important;
          }

          .company-name span {
            color: #34d399 !important;
          }

          .receipt-title {
            color: #cbd5e1 !important;
            font-size: 12px !important;
            margin-top: 5px !important;
          }

          .invoice-label {
            color: #94a3b8 !important;
            font-size: 10px !important;
            letter-spacing: 1px !important;
            font-weight: 700 !important;
          }

          .invoice-number {
            color: #ffffff !important;
            font-size: 13px !important;
            font-weight: 700 !important;
            margin-top: 4px !important;
          }

          .invoice-date {
            color: #cbd5e1 !important;
            font-size: 11px !important;
            margin-top: 4px !important;
          }

          .section {
            padding: 16px 24px !important;
            border-bottom: 1px solid #e2e8f0 !important;
            background: #ffffff !important;
          }

          .compact-section {
            padding-top: 12px !important;
            padding-bottom: 12px !important;
          }

          .section-title {
            margin-bottom: 10px !important;
            font-size: 10px !important;
            color: #475569 !important;
            font-weight: 800 !important;
            letter-spacing: 0.8px !important;
          }

          .info-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px 32px !important;
          }

          .info-item span {
            font-size: 10px !important;
            color: #64748b !important;
            margin-bottom: 3px !important;
            display: block !important;
          }

          .info-item strong {
            font-size: 12px !important;
            color: #0f172a !important;
            display: block !important;
          }

          .status-completed {
            color: #059669 !important;
            font-weight: 700 !important;
          }

          .address-box {
            padding: 10px 14px !important;
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 6px !important;
            color: #1e293b !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
          }

          .items-table {
            width: 100% !important;
            border-collapse: collapse !important;
            table-layout: fixed !important;
            font-size: 11px !important;
          }

          .items-table th {
            padding: 8px 12px !important;
            background: #f1f5f9 !important;
            border-top: 1px solid #cbd5e1 !important;
            border-bottom: 1px solid #cbd5e1 !important;
            color: #334155 !important;
            font-size: 10px !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            text-align: right !important;
          }

          .items-table th:first-child {
            text-align: left !important;
          }

          .items-table td {
            padding: 8px 12px !important;
            border-bottom: 1px solid #e2e8f0 !important;
            color: #334155 !important;
            font-size: 11px !important;
            text-align: right !important;
            vertical-align: middle !important;
          }

          .items-table .item-column {
            width: 44% !important;
          }

          .items-table .item-name {
            color: #0f172a !important;
            font-weight: 600 !important;
            text-align: left !important;
          }

          .amount-cell {
            color: #0f172a !important;
            font-weight: 700 !important;
          }

          .settlement-section {
            border-bottom: 0 !important;
            padding-bottom: 16px !important;
          }

          .settlement-content {
            max-width: 450px !important;
            margin-left: auto !important;
          }

          .settlement-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 5px 0 !important;
            font-size: 11px !important;
          }

          .settlement-row span {
            color: #475569 !important;
          }

          .settlement-row strong {
            color: #0f172a !important;
            font-weight: 700 !important;
          }

          .final-amount-row {
            margin-top: 8px !important;
            padding-top: 10px !important;
            border-top: 2px solid #cbd5e1 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
          }

          .final-amount-row span {
            font-size: 12px !important;
            font-weight: 800 !important;
            color: #0f172a !important;
            letter-spacing: 0.4px !important;
          }

          .final-amount-row strong {
            font-size: 18px !important;
            font-weight: 800 !important;
            color: #059669 !important;
          }

          .receipt-footer {
            padding: 14px 24px !important;
            background: #f8fafc !important;
            border-top: 1px solid #e2e8f0 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-radius: 0 0 6px 6px !important;
          }

          .receipt-footer strong {
            display: block !important;
            color: #1e293b !important;
            font-size: 10px !important;
          }

          .receipt-footer p {
            margin: 3px 0 0 !important;
            color: #64748b !important;
            font-size: 9px !important;
          }

          .footer-invoice {
            color: #64748b !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            white-space: nowrap !important;
          }

          /* Prevent split across pages */
          .receipt-header,
          .section,
          .settlement-section,
          .receipt-footer {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .items-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
