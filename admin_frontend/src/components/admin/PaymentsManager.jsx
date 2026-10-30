import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Download,
  RefreshCw,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';
import { getAllPayments, getPaymentsSummary } from '../../services/api';

export const PaymentsManager = () => {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({
    total_revenue_usd: 0,
    succeeded_count: 0,
    failed_count: 0,
    total_transactions: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    setIsRefreshing(true);
    const [pRes, sRes] = await Promise.all([
      getAllPayments(),
      getPaymentsSummary()
    ]);
    setIsRefreshing(false);

    if (pRes.success && pRes.data) {
      setPayments(pRes.data);
    }
    if (sRes.success && sRes.data) {
      setSummary(sRes.data);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const matchesSearch =
        p.payment_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.stripe_charge_id && p.stripe_charge_id.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'succeeded' && (p.status === 'succeeded' || p.status === 'Paid')) ||
        (statusFilter === 'failed' && (p.status === 'failed' || p.status === 'Failed'));

      return matchesSearch && matchesStatus;
    });
  }, [payments, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>Global Payments & Revenue Ledger</span>
            <Badge variant="info" size="sm">SQLite Stored</Badge>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time audit log of all Stripe credit deposits, card declines, and wallet top-ups across all users.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            onClick={loadData}
          >
            Refresh Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredPayments, null, 2));
              const downloadAnchor = document.createElement('a');
              downloadAnchor.setAttribute("href", dataStr);
              downloadAnchor.setAttribute("download", "nexus_all_payments.json");
              document.body.appendChild(downloadAnchor);
              downloadAnchor.click();
              downloadAnchor.remove();
            }}
          >
            Export JSON
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Total Platform Revenue</span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              ${summary.total_revenue_usd.toFixed(2)}
            </div>
            <p className="text-[11px] text-zinc-400">Cumulative pre-paid credits deposited via Stripe</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Succeeded Payments</span>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100">
              {summary.succeeded_count}
            </div>
            <p className="text-[11px] text-emerald-400 font-medium">Credited to user wallets</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Failed / Declined Cards</span>
              <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {summary.failed_count}
            </div>
            <p className="text-[11px] text-rose-400/90 font-medium">Logged without credit top-up</p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        {/* Filter Toolbar */}
        <div className="p-3.5 border-b border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-zinc-900/40">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by User Email, Payment ID, or Stripe Charge ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto">
            {['ALL', 'succeeded', 'failed'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  statusFilter === st
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900'
                }`}
              >
                {st === 'ALL' ? 'All Statuses' : st === 'succeeded' ? '✓ Succeeded' : '✕ Failed'}
              </button>
            ))}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Payment ID</TableHead>
              <TableHead>User Email</TableHead>
              <TableHead>Amount (USD)</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stripe Charge ID / Failure Reason</TableHead>
              <TableHead className="text-right">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayments.length === 0 ? (
              <TableRow hover={false}>
                <TableCell colSpan={7} className="text-center py-10 text-zinc-500">
                  No payment transactions matching your filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredPayments.map((p) => {
                const isSucceeded = p.status === 'succeeded' || p.status === 'Paid';
                return (
                  <TableRow key={p.payment_id}>
                    <TableCell className="font-mono text-xs font-bold text-amber-400">
                      {p.payment_id}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-zinc-200">
                      {p.user_email}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-zinc-100">
                      ${p.amount_usd.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {p.payment_method}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isSucceeded ? 'success' : 'destructive'} size="sm" dot={true}>
                        {isSucceeded ? 'Succeeded' : 'Failed'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {isSucceeded ? (
                        <span className="text-emerald-400">{p.stripe_charge_id || 'ch_verified'}</span>
                      ) : (
                        <span className="text-rose-400/90 italic">{p.failure_reason || 'Declined'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400 text-right whitespace-nowrap">
                      {p.created_at}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
