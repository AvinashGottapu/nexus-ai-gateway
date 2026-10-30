import React, { useState } from 'react';
import {
  CreditCard,
  Wallet,
  Zap,
  ArrowUpRight,
  Download,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';

export const BillingUsage = ({ userMetrics }) => {
  const [balance, setBalance] = useState(userMetrics.remainingBalanceUsd);
  const [addedNotice, setAddedNotice] = useState(false);

  const handleAddCredits = (amount) => {
    setBalance(prev => prev + amount);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 3000);
  };

  const invoices = [
    { id: 'INV-2026-003', date: '2026-10-01', amount: 25.00, status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'INV-2026-002', date: '2026-09-01', amount: 25.00, status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'INV-2026-001', date: '2026-08-01', amount: 10.00, status: 'Paid', method: 'Mastercard •••• 8812' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Billing & Quota Usage
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Monitor your pre-paid inference credits, monthly token quotas, and invoice receipts.
        </p>
      </div>

      {addedNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4" />
          <span>Credits successfully deposited to your wallet balance.</span>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">Available Balance</span>
            <div className="text-2xl font-bold font-mono text-zinc-50">
              ${balance.toFixed(4)}
            </div>
            <p className="text-[11px] text-zinc-400">Pre-paid balance deducted per token</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">Total Cache Savings</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              ${userMetrics.cacheSavingsUsd.toFixed(2)}
            </div>
            <p className="text-[11px] text-zinc-400">0ms Semantic Cache hits ($0.00 charges)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">Monthly Usage Quota</span>
            <div className="text-2xl font-bold font-mono text-indigo-400">
              {((userMetrics.monthlyApiCalls / userMetrics.monthlyQuota) * 100).toFixed(0)}%
            </div>
            <p className="text-[11px] text-zinc-400">{userMetrics.monthlyApiCalls.toLocaleString()} of {userMetrics.monthlyQuota.toLocaleString()} requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Reload Credits Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Deposit Pre-paid Inference Credits</CardTitle>
          <p className="text-xs text-zinc-400 mt-0.5">
            Select a quick recharge pack to top up your gateway key balance.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {[10, 25, 50, 100].map((amt) => (
              <Button
                key={amt}
                variant="outline"
                size="md"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => handleAddCredits(amt)}
              >
                +${amt}.00 USD
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Billing Receipts</CardTitle>
          <p className="text-xs text-zinc-400 mt-0.5">
            Download PDF receipts for your account records.
          </p>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Billing Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-xs font-semibold text-indigo-400">
                  {inv.id}
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {inv.date}
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold text-zinc-100">
                  ${inv.amount.toFixed(2)}
                </TableCell>
                <TableCell className="text-xs text-zinc-400">
                  {inv.method}
                </TableCell>
                <TableCell>
                  <Badge variant="success" size="sm">{inv.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" icon={<Download className="w-3.5 h-3.5" />}>
                    PDF
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
