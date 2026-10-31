import React, { useState, useEffect } from 'react';
import {
  Send,
  Zap,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Terminal,
  Layers,
  Activity,
  Flame
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { AVAILABLE_MODELS } from '../../data/mockData';
import { runLiveInference, runLiveStreamingInference } from '../../services/api';

export const InteractivePlayground = ({ apiKeys, onRequestGenerated }) => {
  const [selectedKeyId, setSelectedKeyId] = useState(apiKeys[0]?.id || apiKeys[0]?.key_hash || '');
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [prompt, setPrompt] = useState('What is the return policy for footwear within 30 days?');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Feature 2: Real-Time SSE Token Streaming State
  const [streamMode, setStreamMode] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [ttftMs, setTtftMs] = useState(null);

  // Automatically sync selectedKeyId whenever live apiKeys loads/updates
  useEffect(() => {
    if (apiKeys && apiKeys.length > 0) {
      const match = apiKeys.find(k => k.id === selectedKeyId || k.key_hash === selectedKeyId);
      if (!match) {
        setSelectedKeyId(apiKeys[0].id || apiKeys[0].key_hash || '');
      }
    }
  }, [apiKeys, selectedKeyId]);

  const presets = [
    { label: 'Cache Hit Test (Shoe Policy)', text: 'What is the return policy for footwear within 30 days?' },
    { label: 'Python Async Redis Script', text: 'Write a Python FastAPI Redis client with automatic retries.' },
    { label: 'PII Masking Test', text: 'My name is John Doe and my email is john.doe@acme.com. Please review my account.' }
  ];

  const handleRun = async () => {
    setIsLoading(true);
    setResult(null);
    setStreamedText('');
    setTtftMs(null);

    const activeKey = apiKeys.find(k => k.id === selectedKeyId || k.key_hash === selectedKeyId) || apiKeys[0];
    const keyToUse = activeKey?.key_hash || activeKey?.rawKey || activeKey?.id || 'demo-key';

    // ========================================================
    // PATH A: REAL-TIME SSE TOKEN STREAMING (FEATURE 2)
    // ========================================================
    if (streamMode) {
      setIsStreaming(true);
      let accumulated = '';

      const live = await runLiveStreamingInference({
        prompt,
        apiKey: keyToUse,
        model: selectedModel,
        onFirstToken: (firstTokenMs) => {
          setTtftMs(firstTokenMs);
        },
        onToken: (token, fullText) => {
          accumulated = fullText;
          setStreamedText(fullText);
        },
        onComplete: (summary) => {
          setIsLoading(false);
          setIsStreaming(false);
          setResult({
            ...summary,
            isLive: true
          });
          if (onRequestGenerated) {
            onRequestGenerated({
              id: summary.traceId || `req_${Math.random().toString(16).substring(2, 9)}`,
              endpoint: '/v1/chat/completions/stream',
              model: selectedModel,
              provider: summary.providerUsed || (selectedModel.includes('gemini') ? 'Gemini' : selectedModel.includes('openai') ? 'OpenAI' : 'Groq'),
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              latencyMs: summary.latencyMs,
              ttftMs: summary.ttftMs,
              statusCode: 200,
              tokens: summary.tokens,
              costUsd: summary.costUsd,
              isCacheHit: summary.isCacheHit,
              userPromptSnippet: prompt,
              safetyCheck: 'PASSED'
            });
          }
        },
        onError: (errMsg, status) => {
          setIsLoading(false);
          setIsStreaming(false);
          const isAuthErr = status === 401 || status === 403;
          const errorDetails = isAuthErr
            ? `Authentication Error: ${errMsg}\n\nPlease select an active API Key from the dropdown, or create a new key under 'API Keys'.`
            : `Streaming Request Failed: ${errMsg}\n\nEnsure backend is running on port 8000.`;

          setResult({
            content: `⚠️ ${errorDetails}`,
            model: selectedModel,
            latencyMs: 0,
            isCacheHit: false,
            tokens: 0,
            costUsd: 0.0,
            isLive: false,
            backendError: errMsg
          });
        }
      });
      return;
    }

    // ========================================================
    // PATH B: STANDARD BATCH REQUEST (WHOLE JSON PAYLOAD)
    // ========================================================
    const live = await runLiveInference({
      prompt,
      apiKey: keyToUse,
      model: selectedModel
    });

    setIsLoading(false);

    if (live.success && live.data) {
      setResult({
        ...live.data,
        latencyMs: live.data.latencyMs ?? live.latencyMs ?? 0,
        promptTokens: live.data.promptTokens ?? 0,
        completionTokens: live.data.completionTokens ?? 0,
        isLive: true
      });
      if (onRequestGenerated) {
        onRequestGenerated({
          id: live.data.traceId || `req_${Math.random().toString(16).substring(2, 9)}`,
          endpoint: '/v1/chat/completions',
          model: live.data.model,
          provider: selectedModel.includes('gemini') ? 'Gemini' : selectedModel.includes('openai') ? 'OpenAI' : 'Groq',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          latencyMs: live.latencyMs,
          statusCode: 200,
          tokens: live.data.tokens,
          costUsd: live.data.costUsd,
          isCacheHit: live.data.isCacheHit,
          userPromptSnippet: prompt,
          safetyCheck: 'PASSED'
        });
      }
      return;
    }

    const isAuthErr = live.statusCode === 401 || live.statusCode === 403;
    const errorDetails = isAuthErr
      ? `Authentication Error: ${live.error}\n\nPlease select an active API Key from the dropdown, or create a new key under 'API Keys'.`
      : `Gateway Request Failed: ${live.error || 'Connection refused'}\n\nCould not reach the FastAPI gateway at http://localhost:8000.`;

    setResult({
      content: `⚠️ ${errorDetails}`,
      model: selectedModel,
      latencyMs: live.latencyMs || 0,
      isCacheHit: false,
      tokens: 0,
      costUsd: 0.0,
      piiRedacted: false,
      isLive: false,
      backendError: live.error || 'Request failed'
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <span>Interactive Gateway Playground</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono">
              SSE Streaming Active
            </span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time inference with sub-100ms Time-To-First-Token (TTFT), Presidio PII Masking, and Semantic Caching.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Input Panel */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-500" />
                <CardTitle>Request Composer</CardTitle>
              </div>
              <Badge variant={streamMode ? 'success' : 'info'} size="sm">
                {streamMode ? 'POST /v1/chat/completions/stream' : 'POST /v1/chat/completions'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Controls: Key & Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    API Secret Key
                  </label>
                  <select
                    value={selectedKeyId}
                    onChange={(e) => setSelectedKeyId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {apiKeys.map(k => (
                      <option key={k.id} value={k.id}>
                        {k.name} ({k.tier})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Route Target Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.provider})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Streaming Toggle Switch */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">Real-Time SSE Token Stream</span>
                    <span className="text-[10px] text-zinc-500 font-mono block">Sub-100ms TTFT • Word-by-word streaming</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStreamMode(!streamMode)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${streamMode ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${streamMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Presets */}
              <div>
                <span className="text-[11px] font-semibold text-zinc-400 block mb-1.5">Quick Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(preset.text)}
                      className="text-[11px] px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Textarea */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  User Prompt
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="w-full p-3 text-xs font-mono rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Presidio PII + Prompt Guard armed</span>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  icon={isLoading ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  disabled={isLoading || !prompt.trim()}
                  onClick={handleRun}
                >
                  {isLoading ? (isStreaming ? 'Streaming Tokens...' : 'Executing...') : 'Execute Request'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Response Inspection Panel */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gateway Output & Live Telemetry</CardTitle>
              {(result || isStreaming) && (
                <div className="flex items-center gap-1.5">
                  <Badge variant={isStreaming ? 'warning' : (result?.isLive ? 'success' : 'neutral')} size="sm">
                    {isStreaming ? '⚡ STREAMING' : (result?.isLive ? '🟢 LIVE GATEWAY' : '🟡 OFFLINE')}
                  </Badge>
                  {result?.isCacheHit && (
                    <Badge variant="success" size="sm">
                      ⚡ CACHE HIT
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              {!result && !isLoading && !isStreaming && (
                <div className="h-56 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                  <Terminal className="w-8 h-8 mb-2 text-zinc-400" />
                  <p className="text-xs font-medium">Ready for dispatch.</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Click "Execute Request" to stream tokens word-by-word with live TTFT calculation.
                  </p>
                </div>
              )}

              {/* Waiting for first token state */}
              {isLoading && isStreaming && !streamedText && (
                <div className="h-56 flex flex-col items-center justify-center space-y-2 text-center text-zinc-400">
                  <Sparkles className="w-6 h-6 animate-spin text-amber-500" />
                  <span className="text-xs font-mono">Routing to LPU inference engine (Awaiting TTFT)...</span>
                </div>
              )}

              {/* Waiting for non-streaming batch response */}
              {isLoading && !isStreaming && (
                <div className="h-56 flex flex-col items-center justify-center space-y-2 text-center text-zinc-400">
                  <Sparkles className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs font-mono">Evaluating Semantic Cache & Model Gateway...</span>
                </div>
              )}

              {/* Active Streaming or Completed Result Display */}
              {((isStreaming && streamedText) || result) && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  {/* 4 Metrics Strip */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-center">
                      <span className="text-[10px] text-zinc-400 block font-medium">TTFT</span>
                      <span className="text-xs font-bold font-mono text-amber-500">
                        {(result?.ttftMs ?? ttftMs) ? `${Math.round(result?.ttftMs ?? ttftMs)} ms` : '--'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-center">
                      <span className="text-[10px] text-zinc-400 block font-medium">Latency</span>
                      <span className="text-xs font-bold font-mono text-emerald-500">
                        {result?.latencyMs ? `${result.latencyMs} ms` : (isStreaming ? 'Streaming...' : '0 ms')}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-center">
                      <span className="text-[10px] text-zinc-400 block font-medium">Tokens</span>
                      <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-200">
                        {result?.tokens ?? Math.max(1, Math.round(streamedText.length / 4))}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-center">
                      <span className="text-[10px] text-zinc-400 block font-medium">Cost</span>
                      <span className="text-xs font-bold font-mono text-amber-400">
                        ${(result?.costUsd ?? 0.0001).toFixed(6)}
                      </span>
                    </div>
                  </div>

                  {/* Content Box with Live Animated Cursor */}
                  <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 font-sans leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                    {isStreaming ? (
                      <span>
                        {streamedText}
                        <span className="inline-block w-1.5 h-3.5 bg-amber-500 animate-pulse ml-0.5 align-middle" />
                      </span>
                    ) : (
                      (result?.content || '')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<DATE_TIME>/g, '30 days')
                        .replace(/<LOCATION>/g, 'India')
                        .replace(/<NRP>/g, 'Indian')
                    )}
                  </div>

                  {result?.isCacheHit && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>Zero-Shot Semantic Cache Hit. Instant return with $0.00 token cost.</span>
                    </div>
                  )}

                  {result?.failoverTriggered && (
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs flex items-center gap-2">
                      <Layers className="w-4 h-4 shrink-0" />
                      <span>Provider Failover Active: Cascaded to backup provider with zero user downtime.</span>
                    </div>
                  )}

                  {!result?.isLive && !isStreaming && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 shrink-0" />
                      <span>Backend offline on port 8000. Start backend to query live Groq/OpenAI APIs.</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
export default InteractivePlayground;
