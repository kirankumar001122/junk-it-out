'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Clock,
  Receipt,
  ShieldCheck,
  AlertCircle,
  Truck,
  ChevronLeft,
} from 'lucide-react';

interface WalletData {
  id: string;
  agentId: string;
  balance: number;
  updatedAt: string;
}

interface WalletTransaction {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  referenceId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AgentWalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWalletData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/agent/wallet', {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        if (res.status === 401) {
          setError('Agent session expired. Please sign in again.');
        } else {
          setError(json.message || 'Failed to load wallet data.');
        }
        return;
      }

      setWallet(json.data.wallet);
      setTransactions(json.data.transactions || []);
    } catch {
      setError('Network connection error. Please retry.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'CREDIT':
      case 'MANUAL_CREDIT':
      case 'PICKUP_EARNINGS':
        return {
          icon: ArrowUpRight,
          label: type === 'PICKUP_EARNINGS' ? 'Pickup Earnings' : 'Credit',
          color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60',
          amountColor: 'text-emerald-400',
          prefix: '+',
        };
      case 'REFUND':
        return {
          icon: ArrowUpRight,
          label: 'Refund',
          color: 'text-sky-400 bg-sky-950/60 border-sky-800/60',
          amountColor: 'text-sky-400',
          prefix: '+',
        };
      case 'DEBIT':
      case 'MANUAL_DEBIT':
        return {
          icon: ArrowDownLeft,
          label: 'Debit',
          color: 'text-rose-400 bg-rose-950/60 border-rose-800/60',
          amountColor: 'text-rose-400',
          prefix: '-',
        };
      default:
        return {
          icon: Receipt,
          label: type.replace(/_/g, ' '),
          color: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
          amountColor: 'text-amber-400',
          prefix: '',
        };
    }
  };

  return (
    <div className="bg-slate-950 text-white min-h-screen font-sans pb-28 pt-4 px-3 sm:px-4 max-w-md mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between bg-slate-900 border border-slate-800/90 rounded-3xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/agent"
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-300 transition-colors"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">
              Field Agent
            </span>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Agent Wallet
            </h1>
          </div>
        </div>

        <button
          onClick={() => fetchWalletData(true)}
          disabled={isRefreshing || loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-300 transition-colors disabled:opacity-50"
          title="Refresh Wallet"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </header>

      {/* Error Notice */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-rose-950/80 border border-rose-800/60 rounded-2xl p-3.5 text-xs text-rose-200 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchWalletData(true)}
            className="text-rose-300 font-bold underline text-[11px] shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Wallet Balance Card */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Available Balance
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secured
          </span>
        </div>

        <div className="space-y-1">
          <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {loading ? (
              <div className="h-9 w-36 bg-slate-800 rounded animate-pulse" />
            ) : (
              formatCurrency(wallet?.balance ?? 0)
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {wallet?.updatedAt
              ? `Last updated: ${new Date(wallet.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Direct deposits & earnings'}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-950/50 p-2.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">Settlement Status</span>
            <span className="text-xs font-bold text-emerald-400">Direct Payout</span>
          </div>
          <div className="bg-slate-950/50 p-2.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">Ledger Records</span>
            <span className="text-xs font-bold text-slate-200">{transactions.length}</span>
          </div>
        </div>
      </section>

      {/* Transactions Section */}
      <section className="bg-slate-900 border border-slate-800/90 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            Transaction History
          </h2>
          <span className="text-[11px] font-bold text-slate-400">
            {transactions.length} transactions
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-400" />
            <p className="text-xs text-slate-400">Loading ledger records...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="p-3 bg-slate-800/50 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
              <Receipt className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-300">No transactions yet</p>
            <p className="text-[11px] text-slate-500">
              Your wallet balance adjustments and earnings will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3 divide-y divide-slate-800/60">
            {transactions.map((tx) => {
              const badge = getTransactionBadge(tx.type);
              const BadgeIcon = badge.icon;

              return (
                <div key={tx.id} className="pt-3 first:pt-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border ${badge.color}`}>
                        <BadgeIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">
                            {badge.label}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            {tx.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {new Date(tx.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-sm font-black ${badge.amountColor}`}>
                        {badge.prefix}
                        {formatCurrency(tx.amount)}
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        Bal: {formatCurrency(tx.balanceAfter)}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Metadata: reason, order #, ref ID */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5 text-[11px] space-y-1">
                    {tx.reason && (
                      <div className="text-slate-300 flex items-start gap-1">
                        <span className="text-slate-500 shrink-0 font-medium">Reason:</span>
                        <span className="font-medium text-slate-200">{tx.reason}</span>
                      </div>
                    )}
                    {tx.orderNumber && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <Truck className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>Order #{tx.orderNumber}</span>
                      </div>
                    )}
                    {tx.referenceId && (
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        Ref: {tx.referenceId}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
