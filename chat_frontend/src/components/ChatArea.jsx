import React, { useRef, useEffect, useState } from 'react';
import { 
  Sparkles, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  RotateCcw, 
  Zap, 
  Brain, 
  ShieldCheck, 
  Database,
  Calculator,
  Code2,
  Cpu
} from 'lucide-react';
import { FormattedMarkdown } from '../utils/markdown';

const SUGGESTIONS = [
  {
    title: 'Write & test Python code',
    desc: 'Verify a palindrome algorithm with test cases using native execution',
    prompt: 'Write a Python function to check if a word is a palindrome, test it with "racecar" and "hello", and report the verified results.'
  },
  {
    title: 'Calculate financial math',
    desc: 'Compound interest & loan EMI calculated with 100% precision',
    prompt: 'If I invest $500 monthly at 7% annual interest for 20 years, calculate my total wealth, principal invested, and interest earned.'
  },
  {
    title: 'Multi-Step reasoning',
    desc: 'Deep chain-of-thought logic and system architecture trade-offs',
    prompt: 'Compare Single-Leader vs Multi-Leader database replication for an enterprise payment system. What are the consistency and failover trade-offs?'
  },
  {
    title: 'Search & summarize knowledge',
    desc: '2-Stage Hybrid RAG (BM25 + Dense Vectors + Cross-Encoder)',
    prompt: 'Explain how Reciprocal Rank Fusion (RRF) and Cross-Encoder re-ranking improve retrieval quality over dense-only vector search.'
  }
];

export default function ChatArea({ 
  messages, 
  isStreaming, 
  onSendSuggestion, 
  onRegenerate 
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col items-center">
      <div className="w-full max-w-3xl flex-1 flex flex-col justify-start">
        {/* Empty State: Greeting & Suggestion Chips (Matches ChatGPT & Gemini screenshots) */}
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center my-auto text-center px-4 py-12 animate-in fade-in zoom-in-95 duration-200">
            {/* Gemini Multi-color Sparkle Star */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-500 via-indigo-500 to-pink-500 p-0.5 shadow-2xl shadow-blue-500/20 mb-6">
              <div className="w-full h-full bg-[#141414] rounded-2xl flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-blue-400 animate-pulse" />
              </div>
            </div>

            {/* Greeting */}
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
              How can I help, <span className="gemini-text-gradient">Avinash</span>?
            </h1>
            <p className="text-neutral-400 text-sm max-w-md mx-auto mb-10 leading-relaxed">
              Powered by Nexus AI Multi-Provider Gateway, native Python code execution, and 2-stage Hybrid RAG.
            </p>

            {/* 4 Suggestion Cards (ChatGPT/Gemini style) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendSuggestion(s.prompt)}
                  className="p-4 rounded-2xl bg-[#1c1c1c] hover:bg-[#252525] border border-[#2c2c2c] hover:border-[#3d3d3d] transition-all text-left group shadow-sm"
                >
                  <div className="font-semibold text-xs text-white group-hover:text-blue-400 transition-colors flex items-center justify-between">
                    <span>{s.title}</span>
                    <Sparkles className="w-3.5 h-3.5 text-neutral-500 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                    {s.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message Stream List */
          <div className="space-y-6 pb-6">
            {messages.map((msg, index) => (
              <MessageItem 
                key={index} 
                message={msg} 
                isLast={index === messages.length - 1} 
                isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
                onRegenerate={onRegenerate}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageItem({ message, isLast, isStreaming, onRegenerate }) {
  const isUser = message.role === 'user';
  const [toolsOpen, setToolsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end items-start gap-3 pl-8">
        <div className="max-w-[85%] rounded-3xl px-5 py-3 bg-[#262626] border border-[#333333] text-white text-[15px] leading-relaxed shadow-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // Assistant Message
  const toolsExecuted = message.metadata?.mcp_tools_executed || [];
  const hasTools = toolsExecuted.length > 0;
  const provider = message.metadata?.provider_used || 'groq';
  const subIntent = message.metadata?.sub_intent;
  const savingsBadge = message.metadata?.savings_badge;
  const autoRag = message.metadata?.auto_rag_promoted;

  return (
    <div className="flex items-start gap-4 pr-4">
      {/* Nexus Assistant Logo Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-md shadow-blue-500/10">
        <Sparkles className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Model & Metadata Badges Bar */}
        {message.metadata && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-1">
            {/* Provider Pill */}
            <span className="px-2.5 py-0.5 rounded-full bg-[#1f1f1f] border border-[#303030] text-neutral-300 font-mono font-medium flex items-center gap-1">
              <Cpu className="w-3 h-3 text-blue-400" />
              {provider.toUpperCase()}
            </span>

            {/* Sub-intent / SLA */}
            {subIntent && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-medium capitalize">
                {subIntent}
              </span>
            )}

            {/* Auto RAG */}
            {autoRag && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1">
                <Database className="w-3 h-3" /> Auto-RAG
              </span>
            )}

            {/* Cache Hit indicator */}
            {message.metadata?.cache?.hit && (
              <span className="px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 font-medium">
                ⚡ Semantic Cache Hit (0ms)
              </span>
            )}
          </div>
        )}

        {/* Tool Call Dropdown Accordion (When Python or MCP tools were executed) */}
        {hasTools && (
          <div className="my-2 rounded-xl border border-[#333] bg-[#141414] overflow-hidden text-xs">
            <button
              onClick={() => setToolsOpen(!toolsOpen)}
              className="w-full flex items-center justify-between px-3.5 py-2 bg-[#1b1b1b] hover:bg-[#222] text-neutral-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold text-white">
                  Executed {toolsExecuted.length} Tool Action{toolsExecuted.length > 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  ({toolsExecuted.map(t => t.tool_name).join(', ')})
                </span>
              </div>
              {toolsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {toolsOpen && (
              <div className="p-3 space-y-2.5 divide-y divide-[#262626]">
                {toolsExecuted.map((t, tIdx) => (
                  <div key={tIdx} className={tIdx > 0 ? 'pt-2' : ''}>
                    <div className="flex items-center justify-between text-neutral-400 font-mono text-[11px] mb-1">
                      <span className="text-amber-300 font-semibold">{t.tool_name}</span>
                      <span className="text-emerald-400 font-medium">{t.status}</span>
                    </div>
                    {t.arguments?.code && (
                      <div className="bg-[#0f0f0f] p-2 rounded-lg font-mono text-[11px] text-neutral-300 mb-1 overflow-x-auto border border-[#242424]">
                        <pre><code>{t.arguments.code}</code></pre>
                      </div>
                    )}
                    <div className="bg-[#181818] p-2 rounded-lg font-mono text-[11px] text-neutral-400 overflow-x-auto border border-[#242424]">
                      <span className="text-neutral-500 block text-[10px]">OUTPUT:</span>
                      <pre><code>{t.output}</code></pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message Content with Markdown Formatting */}
        <div className={`prose prose-invert max-w-none ${isStreaming ? 'streaming-cursor' : ''}`}>
          <FormattedMarkdown content={message.content} />
        </div>

        {/* Footer Actions (Copy, Regenerate) */}
        {!isStreaming && (
          <div className="flex items-center gap-2 pt-2 text-neutral-400">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-[#242424] hover:text-white transition-colors"
              title="Copy answer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {isLast && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="p-1.5 rounded-lg hover:bg-[#242424] hover:text-white transition-colors"
                title="Regenerate response"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
