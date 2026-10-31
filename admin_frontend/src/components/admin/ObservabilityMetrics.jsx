import React from 'react';
import {
  Activity,
  Zap,
  Clock,
  Database,
  Layers,
  Server,
  ArrowUpRight,
  TrendingDown,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';

export const ObservabilityMetrics = ({ metrics, circuitBreakers, isLoadingMetrics = false }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
          <span>Traffic & Gateway Observability</span>
          <Badge variant="info" size="sm">Layer D Engine</Badge>
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Real-time distributed tracing, rolling 1-hour Redis sorted-set latency percentiles, and provider call distributions.
        </p>
      </div>

      {/* Latency Percentiles Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P50 Latency (Median)</span>
            <div className="text-2xl font-bold font-mono text-emerald-400">115 ms</div>
            <p className="text-[11px] text-zinc-400">Includes 38ms Semantic Cache hits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P95 Latency (95th Percentile)</span>
            {isLoadingMetrics || metrics.p95LatencyMs === null || metrics.p95LatencyMs === undefined ? (
              <div className="flex items-center gap-2 my-2">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-xs text-zinc-400 font-mono">Syncing...</span>
              </div>
            ) : (
              <div className="text-2xl font-bold font-mono text-indigo-400">{metrics.p95LatencyMs} ms</div>
            )}
            <p className="text-[11px] text-zinc-400">Rolling 3600-second window in Upstash</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P99 Latency (Worst-Case)</span>
            <div className="text-2xl font-bold font-mono text-amber-400">810 ms</div>
            <p className="text-[11px] text-zinc-400">During multi-turn context lookups</p>
          </CardContent>
        </Card>
      </div>

      {/* Latency by Phase Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>End-to-End Latency Waterfall by Phase</CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Time spent within each gateway layer during standard request resolution.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[
              { phase: '01. Input Guardrails (Presidio PII + Prompt Guard)', ms: 22, pct: 5, color: 'bg-indigo-500' },
              { phase: '02. Identity & Rate Limit (Upstash Redis REST)', ms: 12, pct: 3, color: 'bg-blue-500' },
              { phase: '03. Semantic Cosine Cache Lookup (Gemini Embedding)', ms: 45, pct: 10, color: 'bg-emerald-500' },
              { phase: '04. Router Intent Classification (Groq gpt-oss-120b)', ms: 85, pct: 18, color: 'bg-amber-500' },
              { phase: '05. Model Gateway Inference & Streaming', ms: 290, pct: 60, color: 'bg-purple-500' },
              { phase: '06. Output Guardrails (Secret Redaction & Verification)', ms: 18, pct: 4, color: 'bg-rose-500' }
            ].map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">{item.phase}</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">{item.ms} ms ({item.pct}%)</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div className={`${item.color} h-2 rounded-full`} style={{ width: `${item.pct * 1.5}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Provider Concurrency & Semaphores */}
      <Card>
        <CardHeader>
          <CardTitle>Provider Semaphore Concurrency Caps</CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Hard concurrency caps preventing HTTP 429 quota exhaustion. Max wait timeout: 2.0s.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Groq Cloud</span>
                <span className="text-emerald-600 dark:text-emerald-400">2 / 5 Active</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '40%' }} />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Semaphore cap: 5 slots</span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Google Gemini</span>
                <span className="text-indigo-600 dark:text-indigo-400">1 / 5 Active</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '20%' }} />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Semaphore cap: 5 slots</span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>OpenAI</span>
                <span className="text-rose-600 dark:text-rose-400">0 / 5 (OPEN)</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: '0%' }} />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Breaker tripped: 0 / 5</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
