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
  const phaseList = metrics.phases && metrics.phases.length > 0 ? metrics.phases : [
    { phase: '01. Input Guardrails (Presidio PII + Prompt Guard)', color: 'bg-indigo-500', ms: null, has_live_data: false },
    { phase: '02. Identity & Rate Limit (Upstash Redis REST)', color: 'bg-blue-500', ms: null, has_live_data: false },
    { phase: '03. Semantic Cosine Cache Lookup (Gemini Embedding)', color: 'bg-emerald-500', ms: null, has_live_data: false },
    { phase: '04. Router Intent Classification (Groq gpt-oss-120b)', color: 'bg-amber-500', ms: null, has_live_data: false },
    { phase: '05. Model Gateway Inference & Streaming', color: 'bg-purple-500', ms: null, has_live_data: false },
    { phase: '06. Output Guardrails (Secret Redaction & Verification)', color: 'bg-rose-500', ms: null, has_live_data: false }
  ];

  const sems = metrics.semaphores || {
    groq: { active: 0, cap: 15 },
    gemini: { active: 0, cap: 15 },
    openai: { active: 0, cap: 20 }
  };

  const getBreaker = (provider) => {
    return (circuitBreakers || []).find(cb => cb.provider.toLowerCase() === provider.toLowerCase());
  };

  const openAiBreaker = getBreaker('openai');
  const isOpenAiOpen = openAiBreaker?.state === 'OPEN';

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
        {/* P50 Median */}
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P50 Latency (Median)</span>
            {isLoadingMetrics ? (
              <div className="flex items-center gap-2 my-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span className="text-xs text-zinc-400 font-mono">Syncing...</span>
              </div>
            ) : metrics.p50LatencyMs !== null && metrics.p50LatencyMs !== undefined ? (
              <div className="text-2xl font-bold font-mono text-emerald-400">{metrics.p50LatencyMs} ms</div>
            ) : (
              <div className="text-2xl font-bold font-mono text-zinc-500">-- ms</div>
            )}
            <p className="text-[11px] text-zinc-400">Includes sub-40ms Semantic Cache hits</p>
          </CardContent>
        </Card>

        {/* P95 95th Percentile */}
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P95 Latency (95th Percentile)</span>
            {isLoadingMetrics ? (
              <div className="flex items-center gap-2 my-2">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-xs text-zinc-400 font-mono">Syncing...</span>
              </div>
            ) : metrics.p95LatencyMs !== null && metrics.p95LatencyMs !== undefined ? (
              <div className="text-2xl font-bold font-mono text-indigo-400">{metrics.p95LatencyMs} ms</div>
            ) : (
              <div className="text-2xl font-bold font-mono text-zinc-500">-- ms</div>
            )}
            <p className="text-[11px] text-zinc-400">Rolling 3600-second window in Upstash</p>
          </CardContent>
        </Card>

        {/* P99 Worst-case */}
        <Card>
          <CardContent className="space-y-1.5">
            <span className="text-xs font-semibold text-zinc-400">P99 Latency (Worst-Case)</span>
            {isLoadingMetrics ? (
              <div className="flex items-center gap-2 my-2">
                <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                <span className="text-xs text-zinc-400 font-mono">Syncing...</span>
              </div>
            ) : metrics.p99LatencyMs !== null && metrics.p99LatencyMs !== undefined ? (
              <div className="text-2xl font-bold font-mono text-amber-400">{metrics.p99LatencyMs} ms</div>
            ) : (
              <div className="text-2xl font-bold font-mono text-zinc-500">-- ms</div>
            )}
            <p className="text-[11px] text-zinc-400">Peak multi-turn & LLM failovers</p>
          </CardContent>
        </Card>
      </div>

      {/* Latency by Phase Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>End-to-End Latency Waterfall by Phase</CardTitle>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Live rolling 1-hour Redis window measured via RequestTimer telemetry.
            </p>
          </div>
          <Badge variant="neutral" size="sm">Rolling 1-Hour Window</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {phaseList.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">{item.phase}</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">
                    {item.has_live_data && item.ms !== null
                      ? `${item.ms} ms (${item.pct}%)`
                      : '-- ms (Awaiting 1h traffic)'}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`${item.color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: item.has_live_data && item.pct > 0 ? `${Math.min(item.pct * 1.2, 100)}%` : '0%' }}
                  />
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
            Live concurrency slots preventing HTTP 429 quota exhaustion. Max wait timeout: 2.0s.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Groq */}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Groq Cloud</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {sems.groq?.active ?? 0} / {sems.groq?.cap ?? 15} Active
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(((sems.groq?.active ?? 0) / (sems.groq?.cap ?? 15)) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Semaphore cap: {sems.groq?.cap ?? 15} slots
              </span>
            </div>

            {/* Gemini */}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>Google Gemini</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {sems.gemini?.active ?? 0} / {sems.gemini?.cap ?? 15} Active
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(((sems.gemini?.active ?? 0) / (sems.gemini?.cap ?? 15)) * 100))}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Semaphore cap: {sems.gemini?.cap ?? 15} slots
              </span>
            </div>

            {/* OpenAI */}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <span>OpenAI</span>
                <span className={isOpenAiOpen ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                  {isOpenAiOpen ? '0 / 20 (OPEN)' : `${sems.openai?.active ?? 0} / ${sems.openai?.cap ?? 20} Active`}
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`${isOpenAiOpen ? 'bg-rose-500' : 'bg-emerald-500'} h-1.5 rounded-full transition-all duration-300`}
                  style={{ width: isOpenAiOpen ? '0%' : `${Math.round(((sems.openai?.active ?? 0) / (sems.openai?.cap ?? 20)) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {isOpenAiOpen ? 'Breaker tripped: 0 / 20' : `Semaphore cap: ${sems.openai?.cap ?? 20} slots`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
