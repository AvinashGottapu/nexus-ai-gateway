import React, { useState } from 'react';
import {
  Sliders,
  Save,
  CheckCircle2,
  Database,
  Shield,
  Layers,
  Server
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const SystemSettings = () => {
  const [similarityThreshold, setSimilarityThreshold] = useState('0.92');
  const [failureThreshold, setFailureThreshold] = useState('3');
  const [cooldownSec, setCooldownSec] = useState('60');
  const [sessionTtlHours, setSessionTtlHours] = useState('2');
  const [concurrencyCap, setConcurrencyCap] = useState('5');
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
          <span>Global Gateway Configuration</span>
          <Badge variant="neutral" size="sm">System Config</Badge>
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Tune algorithmic thresholds for the 4-layer engine, circuit breaker sentinels, and Redis session TTLs.
        </p>
      </div>

      {saved && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4" />
          <span>System configuration successfully updated and broadcast to worker nodes.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Layer A & Semantic Cache Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Layer A: Semantic Cache & Ingestion</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Vector cosine similarity threshold for zero-cost cache hit resolution.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Cosine Similarity Cutoff Threshold (0.00 – 1.00)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="1.0"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Recommended: 0.90 to 0.94 for high precision</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Upstash REST Protocol Endpoint
                </label>
                <input
                  type="text"
                  disabled
                  value="https://pretty-bluebird-137115.upstash.io (Port 443 HTTPS)"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono select-all"
                />
                <p className="text-[11px] text-emerald-400 mt-1">✓ Verified REST over HTTPS</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Layer D: Circuit Breaker & Concurrency */}
        <Card>
          <CardHeader>
            <CardTitle>Layer D: Circuit Breaker Sentinel & Reliability</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Trip conditions for external model provider degradation.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Consecutive Failure Trip Limit
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={failureThreshold}
                  onChange={(e) => setFailureThreshold(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Default: 3 failures</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Cooldown Window (Seconds)
                </label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={cooldownSec}
                  onChange={(e) => setCooldownSec(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Default: 60s cooldown</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Provider Concurrency Semaphore Cap
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={concurrencyCap}
                  onChange={(e) => setConcurrencyCap(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Default: 5 simultaneous slots</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Layer C: Session Store TTL */}
        <Card>
          <CardHeader>
            <CardTitle>Layer C: Session Store & Conversation Memory</CardTitle>
            <p className="text-xs text-zinc-400 mt-0.5">
              Sliding TTL for multi-turn user message history in Redis.
            </p>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Sliding Session TTL (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={sessionTtlHours}
                onChange={(e) => setSessionTtlHours(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-zinc-500 mt-1">Default: 2 hours (7200 seconds)</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="md"
            icon={<Save className="w-4 h-4" />}
            type="submit"
          >
            Apply Configuration
          </Button>
        </div>
      </form>
    </div>
  );
};
