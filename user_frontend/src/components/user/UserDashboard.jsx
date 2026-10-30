import React from 'react';
import {
  Activity,
  Layers,
  Wallet,
  KeyRound,
  Terminal,
  ExternalLink,
  ArrowUpRight,
  Zap,
  Clock,
  Sparkles
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/Table';

export const UserDashboard = ({
  userMetrics,
  requests,
  apiKeys,
  setActiveTab,
  openNewKeyModal
}) => {
  const recentRequests = requests.slice(0, 5);
  const activeKeysCount = apiKeys.filter(k => k.status === 'active').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-zinc-900/60 to-zinc-900/80 border border-indigo-500/20 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-semibold mb-2">
            <Sparkles className="w-3 h-3" />
            <span>Nexus Smart Semantic Routing Active</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Developer Workspace
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed">
            Manage your AI gateway traffic, monitor semantic cache efficiency, and manage credentials with sub-millisecond local caching.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            icon={<Terminal className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('playground')}
          >
            Run Test Query
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<KeyRound className="w-3.5 h-3.5" />}
            onClick={openNewKeyModal}
          >
            Create API Key
          </Button>
        </div>
      </div>

      {/* 3 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Active Sessions & Keys */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Active Client Sessions
              </span>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono">
                {userMetrics.activeSessions}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>{activeKeysCount} Active API Keys bound</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total API Calls */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Monthly Invocations
              </span>
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono">
                {userMetrics.monthlyApiCalls.toLocaleString()}
                <span className="text-xs text-zinc-400 font-normal ml-1">/ {userMetrics.monthlyQuota.toLocaleString()}</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full"
                  style={{ width: `${(userMetrics.monthlyApiCalls / userMetrics.monthlyQuota) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Wallet Balance & Cache Savings */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                Wallet Balance
              </span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 font-mono">
                ${userMetrics.remainingBalanceUsd.toFixed(4)}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <Zap className="w-3.5 h-3.5" />
                <span>Saved ${userMetrics.cacheSavingsUsd.toFixed(2)} via Semantic Cache</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={openNewKeyModal}
          className="p-4 rounded-xl text-left bg-white dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-indigo-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all group"
        >
          <div className="flex items-center justify-between">
            <KeyRound className="w-4 h-4 text-indigo-500" />
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
          </div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-2">
            Provision Secret Key
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Configure SHA-256 hashed credentials with rate limit tiers.
          </div>
        </button>

        <button
          onClick={() => setActiveTab('playground')}
          className="p-4 rounded-xl text-left bg-white dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-indigo-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all group"
        >
          <div className="flex items-center justify-between">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-2">
            Interactive Model Playground
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Test Groq & Gemini endpoints with live cache hit inspection.
          </div>
        </button>

        <a
          href="https://github.com/AvinashGottapu/nexus-ai-gateway"
          target="_blank"
          rel="noreferrer"
          className="p-4 rounded-xl text-left bg-white dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-indigo-500/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all group"
        >
          <div className="flex items-center justify-between">
            <ExternalLink className="w-4 h-4 text-amber-500" />
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-400 transition-colors" />
          </div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-2">
            Gateway OpenAPI Documentation
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Explore /v1/chat/completions schema and error codes.
          </div>
        </a>
      </div>

      {/* Recent Request Activity Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Gateway Invocations</CardTitle>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Showing the latest requests routed through input guardrails and the semantic cache.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveTab('requests')}
            icon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            View All
          </Button>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow hover={false}>
              <TableHead>Request ID</TableHead>
              <TableHead>Model / Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentRequests.map((req) => (
              <TableRow key={req.id}>
                <TableCell className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {req.id}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-xs text-zinc-900 dark:text-zinc-100">
                      {req.model}
                    </span>
                    {req.isCacheHit && (
                      <Badge variant="success" size="sm">
                        CACHE HIT
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {req.statusCode === 200 && (
                    <Badge variant="success" size="sm">200 OK</Badge>
                  )}
                  {req.statusCode === 429 && (
                    <Badge variant="warning" size="sm">429 Rate Limit</Badge>
                  )}
                  {req.statusCode === 400 && (
                    <Badge variant="destructive" size="sm">400 Guardrail</Badge>
                  )}
                  {req.statusCode === 500 && (
                    <Badge variant="destructive" size="sm">500 Failover</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <span className={req.latencyMs < 100 ? 'text-emerald-500 font-semibold' : 'text-zinc-400'}>
                    {req.latencyMs} ms
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">
                  {req.tokens > 0 ? req.tokens : '—'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {req.isCacheHit ? (
                    <span className="text-emerald-500 font-semibold">$0.0000</span>
                  ) : (
                    <span>${req.costUsd.toFixed(6)}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-zinc-500 whitespace-nowrap">
                  {req.timestamp.split(' ')[1]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
