import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  User,
  AlertTriangle,
  FileCode,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const HITLQueue = ({ hitlTickets, setHitlTickets }) => {
  const [filter, setFilter] = useState('Pending');
  const [activeTicket, setActiveTicket] = useState(null);
  const [reviewerNote, setReviewerNote] = useState('');

  const filteredTickets = hitlTickets.filter(t => {
    if (filter === 'ALL') return true;
    return t.status === filter;
  });

  const handleAction = (ticketId, decision) => {
    setHitlTickets(prev =>
      prev.map(t => t.id === ticketId ? {
        ...t,
        status: decision,
        reviewerNote: reviewerNote || (decision === 'Approved' ? 'Manual override approved by Operations Engineer' : 'Blocked per security policy')
      } : t)
    );
    setActiveTicket(null);
    setReviewerNote('');
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <span>Human-in-the-Loop (HITL) Queue</span>
            <Badge variant="warning" size="sm">
              Layer B Review Queue
            </Badge>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Audit and approve high-risk database executions, PII escalations, and flagged prompt injection attempts.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          {['Pending', 'Approved', 'Rejected', 'ALL'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                filter === f
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {filteredTickets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-zinc-500 space-y-2">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-500/80" />
              <div className="text-sm font-semibold text-zinc-300">Queue is Clear</div>
              <div className="text-xs text-zinc-500 max-w-sm mx-auto">
                No tickets matching status "{filter}". High-risk intents flagged by the router will appear here.
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredTickets.map((ticket) => {
            const isPending = ticket.status === 'Pending';
            const isApproved = ticket.status === 'Approved';
            const isRejected = ticket.status === 'Rejected';

            return (
              <Card
                key={ticket.id}
                className={`transition-all ${isPending ? 'border-amber-500/30' : ''}`}
              >
                <CardContent className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${
                        isPending ? 'bg-amber-500/10 text-amber-500' :
                        isApproved ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-rose-500/10 text-rose-500'
                      }`}>
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {ticket.id}
                          </span>
                          <Badge
                            variant={
                              ticket.riskCategory === 'Harmful Content' ? 'destructive' :
                              ticket.riskCategory === 'High Risk Tool' ? 'warning' : 'info'
                            }
                            size="sm"
                          >
                            {ticket.riskCategory}
                          </Badge>
                          <Badge
                            variant={isPending ? 'warning' : isApproved ? 'success' : 'destructive'}
                            size="sm"
                            dot={isPending}
                          >
                            {ticket.status}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Triggered by {ticket.userEmail} ({ticket.userId}) • {ticket.timestamp}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Trigger Reason */}
                  <div className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                    <span className="text-zinc-400 font-normal">Reason: </span>
                    {ticket.triggerReason}
                  </div>

                  {/* Payload Diff / Prompt Snippet */}
                  <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
                    <div className="text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Intercepted Prompt / Payload:</span>
                    </div>
                    <code className="text-xs font-mono text-zinc-800 dark:text-zinc-200 break-words block">
                      {ticket.payloadSnippet}
                    </code>
                  </div>

                  {/* Reviewer Note if processed */}
                  {ticket.reviewerNote && (
                    <div className="text-xs text-zinc-400 font-mono italic bg-zinc-50 dark:bg-zinc-900/40 p-2 rounded border border-zinc-200/50 dark:border-zinc-800">
                      Note: {ticket.reviewerNote}
                    </div>
                  )}

                  {/* Actions Bar for Pending Tickets */}
                  {isPending && (
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="w-full sm:w-auto flex-1 max-w-md">
                        <input
                          type="text"
                          placeholder="Optional developer review comment..."
                          value={activeTicket === ticket.id ? reviewerNote : ''}
                          onChange={(e) => {
                            setActiveTicket(ticket.id);
                            setReviewerNote(e.target.value);
                          }}
                          className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          icon={<X className="w-3.5 h-3.5" />}
                          onClick={() => handleAction(ticket.id, 'Rejected')}
                        >
                          Reject & Block
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                          icon={<Check className="w-3.5 h-3.5" />}
                          onClick={() => handleAction(ticket.id, 'Approved')}
                        >
                          Approve & Execute
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
