import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Terminal,
  Zap,
  Radio,
  Database,
  KeyRound,
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  Server,
  Layers,
  ChevronRight,
  AlertCircle,
  Globe
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const ApiDocs = ({ apiKeys = [] }) => {
  const [activeEndpoint, setActiveEndpoint] = useState('completions'); // 'completions' | 'stream' | 'rag' | 'mcp'
  const [activeLang, setActiveLang] = useState('curl'); // 'curl' | 'python' | 'javascript' | 'openai'
  const [copiedSection, setCopiedSection] = useState(null);

  // Selected API key for interactive code replacement
  const defaultKey = apiKeys.find(k => k.status === 'active')?.key_hash 
    ? `sk-live-${apiKeys.find(k => k.status === 'active').key_hash.substring(0, 16)}` 
    : 'sk-live-your_api_key_here';
  const [selectedKey, setSelectedKey] = useState(defaultKey);

  // Live Tester State
  const [testPrompt, setTestPrompt] = useState('Explain how quantum entanglement works in one paragraph');
  const [testProvider, setTestProvider] = useState('groq');
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState(null);
  const [testStreamOutput, setTestStreamOutput] = useState('');
  const [testTtft, setTestTtft] = useState(null);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://localhost:8000';

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // --- CODE SNIPPET GENERATORS ---
  const getSingleSnippet = (lang) => {
    switch (lang) {
      case 'curl':
        return `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${selectedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "What is the return policy for electronics within 30 days?",
    "provider": "groq",
    "session_id": "user_session_101"
  }'`;

      case 'python':
        return `import requests

url = "${baseUrl}/v1/chat/completions"
headers = {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
}
payload = {
    "prompt": "What is the return policy for electronics within 30 days?",
    "provider": "groq",
    "session_id": "user_session_101"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

print(f"Assistant: {data['response']}")
print(f"Latency: {data['timings_ms']['total_latency_ms']} ms")
print(f"Cost: \${data['billing']['cost_usd']}")`;

      case 'javascript':
        return `// Using native Fetch API in Node.js 18+ or Browser
const response = await fetch("${baseUrl}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    prompt: "What is the return policy for electronics within 30 days?",
    provider: "groq",
    session_id: "user_session_101"
  })
});

const data = await response.json();
console.log("Assistant:", data.response);
console.log("Trace ID:", data.trace_id);
console.log("Total Tokens Cost:", data.billing.cost_usd);`;

      case 'openai':
        return `from openai import OpenAI

# The Nexus Gateway is 100% drop-in compatible with the official OpenAI SDK!
client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${selectedKey}"
)

completion = client.chat.completions.create(
    model="groq", # Or "openai", "gemini", or "auto"
    messages=[
        {"role": "user", "content": "What is the return policy for electronics within 30 days?"}
    ]
)

print(completion.choices[0].message.content)`;
      default:
        return '';
    }
  };

  const getStreamSnippet = (lang) => {
    switch (lang) {
      case 'curl':
        return `curl -N -X POST "${baseUrl}/v1/chat/completions/stream" \\
  -H "Authorization: Bearer ${selectedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a fast Fibonacci sequence algorithm in Python with memoization",
    "provider": "groq"
  }'`;

      case 'python':
        return `import json
import requests

url = "${baseUrl}/v1/chat/completions/stream"
headers = {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
}
payload = {
    "prompt": "Write a fast Fibonacci sequence algorithm in Python with memoization",
    "provider": "groq"
}

# Stream Server-Sent Events (SSE) with sub-100ms TTFT
with requests.post(url, json=payload, headers=headers, stream=True) as r:
    for line in r.iter_lines():
        if line:
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                event = json.loads(decoded[6:])
                if not event.get("done"):
                    # Print tokens in real time as they arrive
                    print(event["token"], end="", flush=True)
                else:
                    print(f"\\n\\n[Complete] Total Tokens: {event.get('total_tokens')}")`;

      case 'javascript':
        return `// Browser / React / Next.js Real-time SSE Token Reader
const response = await fetch("${baseUrl}/v1/chat/completions/stream", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    prompt: "Write a fast Fibonacci sequence algorithm in Python with memoization",
    provider: "groq"
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder("utf-8");

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const rawChunk = decoder.decode(value);
  const lines = rawChunk.split("\\n");
  
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const event = JSON.parse(line.replace("data: ", ""));
      if (!event.done && event.token) {
        // Append token to UI chat bubble
        process.stdout.write(event.token);
      }
    }
  }
}`;

      case 'openai':
        return `from openai import OpenAI

# Stream seamlessly using the OpenAI SDK
client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${selectedKey}"
)

stream = client.chat.completions.create(
    model="groq",
    messages=[
        {"role": "user", "content": "Write a fast Fibonacci sequence in Python"}
    ],
    stream=True # Activates Server-Sent Events
)

for chunk in stream:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="", flush=True)`;
      default:
        return '';
    }
  };

  const getRagSnippet = (lang) => {
    switch (lang) {
      case 'curl':
        return `curl -X POST "${baseUrl}/v1/rag/ingest" \\
  -H "Authorization: Bearer ${selectedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Attention Is All You Need: The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...",
    "source_name": "Attention_Research_Paper.pdf"
  }'`;

      case 'python':
        return `import requests

# Ingest document chunks into the 2-Hour Ephemeral Knowledge Store
url = "${baseUrl}/v1/rag/ingest"
headers = {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
}
payload = {
    "text": open("research_paper.txt", "r").read(),
    "source_name": "Attention_Research_Paper.pdf"
}

res = requests.post(url, json=payload, headers=headers)
print("Knowledge Store Status:", res.json())
# Returns: {"status": "ingested", "chunks_stored": 14, "ttl_hours": 2.0}`;

      default:
        return `// Ingest Document Chunks into Redis with 2-Hour TTL
const res = await fetch("${baseUrl}/v1/rag/ingest", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${selectedKey}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    text: "Employee Handbook: Employees receive 20 days PTO and full medical coverage...",
    source_name: "Employee_Handbook_2026.pdf"
  })
});
const result = await res.json();
console.log("Ingested Chunks:", result.chunks_stored);`;
    }
  };

  // --- LIVE TESTER EXECUTION ---
  const handleRunLiveTest = async () => {
    setIsTesting(true);
    setTestResponse(null);
    setTestStreamOutput('');
    setTestTtft(null);

    const startTime = performance.now();

    try {
      if (activeEndpoint === 'stream') {
        const res = await fetch(`${baseUrl}/v1/chat/completions/stream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${selectedKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: testPrompt,
            provider: testProvider
          })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let firstTokenReceived = false;
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.replace('data: ', ''));
                if (!firstTokenReceived) {
                  setTestTtft(Math.round(performance.now() - startTime));
                  firstTokenReceived = true;
                }
                if (!event.done && event.token) {
                  accumulated += event.token;
                  setTestStreamOutput(accumulated);
                }
              } catch (e) {}
            }
          }
        }
      } else {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${selectedKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: testPrompt,
            provider: testProvider
          })
        });
        const data = await res.json();
        setTestResponse(data);
      }
    } catch (err) {
      setTestResponse({ error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-zinc-900/50 border border-indigo-500/20 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Badge variant="indigo" size="sm">v1.4 REST & SSE</Badge>
            <span className="text-xs text-zinc-400 font-mono flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              {baseUrl}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Code2 className="w-6 h-6 text-indigo-400" />
            Nexus Gateway API Documentation
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Integrate enterprise-grade multi-LLM orchestration, real-time token streaming, 
            semantic caching, and Redis vector knowledge RAG with single-digit millisecond routing.
          </p>
        </div>

        {/* Dynamic Key Inserter */}
        <div className="w-full md:w-auto p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
            <span className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              Active Key in Snippets:
            </span>
            <span className="text-[10px] text-emerald-400">Auto-Injected</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="text-xs font-mono px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {apiKeys.length > 0 ? (
                apiKeys.map(k => (
                  <option key={k.id} value={`sk-live-${k.key_hash ? k.key_hash.substring(0, 16) : k.id}`}>
                    {k.name} ({k.key_hash ? `${k.key_hash.substring(0, 8)}...` : k.id})
                  </option>
                ))
              ) : (
                <option value={selectedKey}>{selectedKey}</option>
              )}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(selectedKey, 'header-key')}
              className="text-xs"
            >
              {copiedSection === 'header-key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Endpoint Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveEndpoint('completions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeEndpoint === 'completions'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Single Response (/v1/chat/completions)</span>
        </button>

        <button
          onClick={() => setActiveEndpoint('stream')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeEndpoint === 'stream'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
          }`}
        >
          <Radio className="w-4 h-4 text-emerald-400" />
          <span>Real-Time Streaming (/v1/chat/completions/stream)</span>
        </button>

        <button
          onClick={() => setActiveEndpoint('rag')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeEndpoint === 'rag'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
          }`}
        >
          <Database className="w-4 h-4 text-purple-400" />
          <span>Knowledge Ingest (/v1/rag/ingest)</span>
        </button>

        <button
          onClick={() => setActiveEndpoint('mcp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeEndpoint === 'mcp'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
          }`}
        >
          <Server className="w-4 h-4 text-amber-400" />
          <span>MCP Host Tools</span>
        </button>
      </div>

      {/* Main Documentation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Code Snippets & Language Switcher */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-500" />
                  Request Code Sample
                </CardTitle>
                <CardDescription>
                  Copy-paste ready snippet with your active API key and base URL.
                </CardDescription>
              </div>

              {/* Language Selector */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/60 text-xs">
                {['curl', 'python', 'javascript', 'openai'].map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={`px-2.5 py-1 rounded-md font-medium capitalize transition-all ${
                      activeLang === lang
                        ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {lang === 'javascript' ? 'JS / TS' : lang}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="relative group">
                <pre className="p-4 bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed selection:bg-indigo-500/30">
                  <code>
                    {activeEndpoint === 'completions' && getSingleSnippet(activeLang)}
                    {activeEndpoint === 'stream' && getStreamSnippet(activeLang)}
                    {activeEndpoint === 'rag' && getRagSnippet(activeLang)}
                    {activeEndpoint === 'mcp' && `// MCP Host Protocol: Nexus Gateway automatically manages 35 tools across 3 servers:
// 1. nexus-local (query_nexus_gateway, get_cluster_observability, search_knowledge_rag)
// 2. github-tools (@modelcontextprotocol/server-github via npx)
// 3. tavily-search (tavily-mcp via npx)

// Simply send your prompt; if tools are needed, the multi-turn agent executes them autonomously:
curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Authorization: Bearer ${selectedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Search GitHub for open issues in repository my-nexus-gateway-v1",
    "provider": "groq"
  }'`}
                  </code>
                </pre>

                {/* Copy Button */}
                <button
                  onClick={() => {
                    const text = activeEndpoint === 'completions' ? getSingleSnippet(activeLang)
                      : activeEndpoint === 'stream' ? getStreamSnippet(activeLang)
                      : getRagSnippet(activeLang);
                    copyToClipboard(text, 'main-code');
                  }}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium transition-all shadow-md"
                >
                  {copiedSection === 'main-code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Request / Response Schema Table */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                HTTP Specifications & Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5">Field</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Required</th>
                      <th className="px-4 py-2.5">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                    <tr>
                      <td className="px-4 py-2.5 font-mono text-indigo-500 font-semibold">prompt</td>
                      <td className="px-4 py-2.5 font-mono text-zinc-400">string</td>
                      <td className="px-4 py-2.5"><Badge variant="error" size="sm">Required</Badge></td>
                      <td className="px-4 py-2.5">The user's input prompt or question. Screened by Presidio PII & Llama Guard.</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 font-mono text-indigo-500 font-semibold">provider</td>
                      <td className="px-4 py-2.5 font-mono text-zinc-400">string</td>
                      <td className="px-4 py-2.5"><Badge variant="default" size="sm">Optional</Badge></td>
                      <td className="px-4 py-2.5"><code className="font-mono text-xs">"groq"</code> (default), <code className="font-mono text-xs">"openai"</code>, <code className="font-mono text-xs">"gemini"</code>, or <code className="font-mono text-xs">"auto"</code>.</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 font-mono text-indigo-500 font-semibold">session_id</td>
                      <td className="px-4 py-2.5 font-mono text-zinc-400">string</td>
                      <td className="px-4 py-2.5"><Badge variant="default" size="sm">Optional</Badge></td>
                      <td className="px-4 py-2.5">Per-user conversation ID. Manages multi-turn sliding window history in Redis.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Interactive Tester */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-indigo-500/30 bg-gradient-to-b from-indigo-950/20 to-zinc-950/40">
            <CardHeader className="pb-3 border-b border-indigo-500/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                  Live API Sandbox Tester
                </CardTitle>
                <Badge variant={activeEndpoint === 'stream' ? 'success' : 'indigo'} size="sm">
                  {activeEndpoint === 'stream' ? 'SSE Streaming' : 'Synchronous REST'}
                </Badge>
              </div>
              <CardDescription>
                Test requests directly from this browser console using your active key.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model Provider</label>
                <select
                  value={testProvider}
                  onChange={(e) => setTestProvider(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="groq">Groq (Ultra-Low Latency LLaMA 3.3)</option>
                  <option value="openai">OpenAI (GPT-4o Reasoning)</option>
                  <option value="gemini">Google Gemini (Flash 2.0)</option>
                </select>
              </div>

              {/* Prompt Input */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">User Prompt</label>
                <textarea
                  rows={3}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  className="w-full text-xs font-mono p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  placeholder="Enter your prompt here..."
                />
              </div>

              {/* Run Button */}
              <Button
                variant="primary"
                onClick={handleRunLiveTest}
                disabled={isTesting || !testPrompt.trim()}
                className="w-full justify-center text-xs py-2.5 font-semibold shadow-lg shadow-indigo-600/30"
              >
                {isTesting ? (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin text-white" />
                    Executing Request...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4 fill-white" />
                    Send Live Request
                  </span>
                )}
              </Button>

              {/* Live Output Window */}
              {(testResponse || testStreamOutput) && (
                <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Live Gateway Response:
                    </span>
                    {testTtft && (
                      <span className="font-mono text-emerald-400">
                        TTFT: {testTtft}ms
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 max-h-64 overflow-y-auto text-xs font-mono text-zinc-200 leading-relaxed selection:bg-indigo-500/30">
                    {activeEndpoint === 'stream' ? (
                      <div>
                        {testStreamOutput || <span className="text-zinc-500 italic">Waiting for token stream...</span>}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(testResponse, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Start Guide */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Enterprise Safety Guarantees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs text-zinc-400">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span><strong>Presidio PII Anonymization</strong>: SSNs, credit cards, emails, and phone numbers are redacted in 0ms CPU time before reaching upstream LLMs.</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span><strong>Semantic Cache Bypass</strong>: Cached answers deliver in ~10ms for $0.00 cost with 90% cosine confidence.</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                <span><strong>Vector-Threshold Auto-RAG</strong>: Uploaded papers automatically ground matching questions with high mathematical similarity ($\ge 0.70$).</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
