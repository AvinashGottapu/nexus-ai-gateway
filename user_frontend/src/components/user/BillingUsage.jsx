import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Wallet,
  Zap,
  ArrowUpRight,
  Download,
  CheckCircle2,
  AlertCircle,
  Plus,
  ShieldCheck,
  Lock,
  X,
  Sparkles,
  Info,
  Check
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';
import { Modal } from '../ui/Modal';
import { getLivePayments, postStripeCheckout } from '../../services/api';

const TEST_CARDS = [
  { label: '4242 4242 4242 4242', type: 'success', desc: 'Standard Visa (Success)', brand: 'Visa' },
  { label: '4000 0000 0000 0002', type: 'decline', desc: 'Card Declined (Fail)', brand: 'Visa' },
  { label: '4000 0000 0000 0127', type: 'insufficient', desc: 'Insufficient Funds', brand: 'Visa' },
  { label: '4000 0000 0000 0069', type: 'expired', desc: 'Expired Card Error', brand: 'Visa' }
];

export const BillingUsage = ({ userMetrics }) => {
  const [balance, setBalance] = useState(userMetrics.remainingBalanceUsd);
  const [payments, setPayments] = useState([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(25);
  
  // Real Developer Card Inputs
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExp, setCardExp] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');
  const [cardName, setCardName] = useState('Sarah Chen');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState(null);

  const currentUserEmail = 'sarah.chen@techcorp.com';

  // Fetch live payments from SQLite backend on load
  const loadPayments = () => {
    getLivePayments(currentUserEmail).then(res => {
      if (res.success && res.data) {
        setPayments(res.data);
      }
    });
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleOpenCheckout = (amt) => {
    setSelectedAmount(amt);
    setCardNumber('4242 4242 4242 4242');
    setIsCheckoutOpen(true);
  };

  const handleCardNumberChange = (e) => {
    // Format card number with spaces every 4 digits
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);
  };

  const getCardStatus = () => {
    const raw = cardNumber.replace(/\s+/g, '');
    if (raw.startsWith('4242')) {
      return { status: 'success', text: 'Stripe Official Test Card (Charge Will Succeed)', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    }
    if (raw.startsWith('4000000000000002')) {
      return { status: 'error', text: 'Stripe Test Card: Will trigger "Your card was declined."', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
    }
    if (raw.startsWith('4000000000000127')) {
      return { status: 'error', text: 'Stripe Test Card: Will trigger "Insufficient funds."', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    }
    if (raw.startsWith('4000000000000069')) {
      return { status: 'error', text: 'Stripe Test Card: Will trigger "Card expired."', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    }
    return { status: 'custom', text: 'Custom Developer Test Card', color: 'text-zinc-400 border-zinc-700 bg-zinc-800/40' };
  };

  const handleProcessPayment = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    const cleanCard = cardNumber.replace(/\s+/g, '');
    const isExpectedFailure = cleanCard.startsWith('4000');
    const outcome = isExpectedFailure ? 'failed' : 'succeeded';

    const res = await postStripeCheckout({
      userEmail: currentUserEmail,
      amountUsd: selectedAmount,
      cardNumber: cleanCard,
      paymentMethod: `Stripe (Visa •••• ${cleanCard.slice(-4) || '4242'})`,
      outcome: outcome
    });

    setIsProcessing(false);
    setIsCheckoutOpen(false);

    if (res.success && res.data) {
      if (res.data.status === 'succeeded') {
        if (res.data.new_balance_usd !== null && res.data.new_balance_usd !== undefined) {
          setBalance(res.data.new_balance_usd);
        } else {
          setBalance(prev => prev + selectedAmount);
        }
        setPaymentNotice({
          type: 'success',
          msg: `Payment of $${selectedAmount}.00 succeeded via Stripe (${res.data.stripe_charge_id || 'ch_live'})! Credits added to your balance.`
        });
      } else {
        setPaymentNotice({
          type: 'error',
          msg: `Payment of $${selectedAmount}.00 failed: ${res.data.failure_reason || 'Card declined by Stripe'}. Recorded in ledger (No credits added).`
        });
      }
      loadPayments();
    } else {
      setPaymentNotice({
        type: 'error',
        msg: `Payment error: ${res.error || 'Connection failed'}`
      });
    }

    setTimeout(() => setPaymentNotice(null), 6000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
          Billing & Quota Usage
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Real-time wallet balance, Stripe recharge checkout, and SQLite persistent invoice ledger.
        </p>
      </div>

      {paymentNotice && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-xs ${
          paymentNotice.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {paymentNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{paymentNotice.msg}</span>
          </div>
          <button onClick={() => setPaymentNotice(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="space-y-2">
            <span className="text-xs font-semibold text-zinc-400">Available Wallet Balance</span>
            <div className="text-2xl font-bold font-mono text-zinc-50">
              ${balance.toFixed(4)}
            </div>
            <p className="text-[11px] text-zinc-400">Pre-paid balance deducted per inference token</p>
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

      {/* Deposit Credits Panel with Stripe Trigger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Deposit Pre-paid Inference Credits</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Secure Stripe payment method. Credits are deposited to your wallet instantly upon approval.
            </p>
          </div>
          <Badge variant="info" size="sm">Stripe 256-bit SSL</Badge>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {[10, 25, 50, 100].map((amt) => (
              <Button
                key={amt}
                variant="outline"
                size="md"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => handleOpenCheckout(amt)}
              >
                +${amt}.00 USD
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Persistent Invoice History Table from SQLite */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Invoice Billing Receipts (SQLite Stored)</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Persistent transactions recording both succeeded deposits and failed attempts.
            </p>
          </div>
          <Badge variant="neutral" size="sm">{payments.length} Transactions</Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Payment ID</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details / Stripe ID</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow hover={false}>
                <TableCell colSpan={7} className="text-center py-8 text-zinc-500">
                  No billing transactions found. Deposit credits to view receipts.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => {
                const isSucceeded = p.status === 'succeeded' || p.status === 'Paid';
                return (
                  <TableRow key={p.payment_id}>
                    <TableCell className="font-mono text-xs font-semibold text-indigo-400">
                      {p.payment_id}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400 whitespace-nowrap">
                      {p.created_at}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-zinc-100">
                      ${p.amount_usd.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-300">
                      {p.payment_method}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isSucceeded ? 'success' : 'destructive'} size="sm" dot={true}>
                        {isSucceeded ? 'Succeeded' : 'Failed'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-zinc-400">
                      {isSucceeded ? (
                        <span className="text-emerald-400/90">{p.stripe_charge_id || 'ch_verified'}</span>
                      ) : (
                        <span className="text-rose-400/90 italic">{p.failure_reason || 'Declined'}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSucceeded ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Download className="w-3.5 h-3.5" />}
                          onClick={() => {
                            const receiptText = `NEXUS AI GATEWAY INVOICE\n-----------------------\nPayment ID: ${p.payment_id}\nUser: ${currentUserEmail}\nAmount: $${p.amount_usd.toFixed(2)} USD\nStatus: Succeeded\nMethod: ${p.payment_method}\nDate: ${p.created_at}\nStripe ID: ${p.stripe_charge_id}\n\nThank you for your business!`;
                            const element = document.createElement("a");
                            const file = new Blob([receiptText], { type: 'text/plain' });
                            element.href = URL.createObjectURL(file);
                            element.download = `${p.payment_id}_receipt.txt`;
                            document.body.appendChild(element);
                            element.click();
                            element.remove();
                          }}
                        >
                          Receipt
                        </Button>
                      ) : (
                        <span className="text-xs text-zinc-500">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Stripe Payment Checkout Modal */}
      <Modal
        isOpen={isCheckoutOpen}
        onClose={() => !isProcessing && setIsCheckoutOpen(false)}
        title="Stripe Payment Checkout"
        description="Deposit pre-paid inference credits directly to your API wallet balance."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleProcessPayment} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1">
            <span className="text-xs text-zinc-400">Deposit Amount:</span>
            <div className="text-2xl font-bold font-mono text-indigo-400">
              ${selectedAmount}.00 <span className="text-xs text-zinc-400 font-normal">USD</span>
            </div>
            <p className="text-[11px] text-zinc-500">Will be credited to: {currentUserEmail}</p>
          </div>

          {/* Interactive Card Inputs */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-zinc-300">
                  Card Number
                </label>
                <span className="text-[11px] text-zinc-400 font-mono">VISA / MC</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  placeholder="4242 4242 4242 4242"
                  maxLength={19}
                  className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
                <CreditCard className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Expires (MM/YY)
                </label>
                <input
                  type="text"
                  value={cardExp}
                  onChange={(e) => setCardExp(e.target.value)}
                  placeholder="12/28"
                  maxLength={5}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  CVC / CVV
                </label>
                <input
                  type="text"
                  value={cardCvc}
                  onChange={(e) => setCardCvc(e.target.value)}
                  placeholder="123"
                  maxLength={4}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Cardholder Name
              </label>
              <input
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Sarah Chen"
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                required
              />
            </div>

            {/* Dynamic Card Validation Indicator */}
            {(() => {
              const status = getCardStatus();
              return (
                <div className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${status.color}`}>
                  {status.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{status.text}</span>
                </div>
              );
            })()}

            {/* Developer Test Card Quick Buttons */}
            <div className="pt-2 border-t border-zinc-800/80">
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Developer Test Card Presets:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {TEST_CARDS.map((c) => {
                  const isSelected = cardNumber.replace(/\s+/g, '') === c.label.replace(/\s+/g, '');
                  return (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setCardNumber(c.label)}
                      className={`text-left p-2 rounded-lg border text-[11px] transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <span className="font-mono font-semibold">{c.label.slice(0, 4)}...{c.label.slice(-4)}</span>
                      <span className="text-[10px] text-zinc-500 mt-0.5">{c.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={isProcessing}
              onClick={() => setIsCheckoutOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={getCardStatus().status === 'success' ? 'primary' : 'destructive'}
              size="md"
              type="submit"
              disabled={isProcessing}
              icon={isProcessing ? <Zap className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
            >
              {isProcessing ? 'Processing with Stripe...' : `Pay $${selectedAmount}.00 with Stripe`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
