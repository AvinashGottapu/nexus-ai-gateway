import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Sparkles, Zap, Brain, Globe2, Check } from 'lucide-react';

const MODELS = [
  {
    id: 'auto',
    name: 'Auto Intelligent Router',
    badge: 'Recommended',
    description: 'Dynamic SLA routing across Groq, OpenAI & Gemini with sub-100ms intent dispatch',
    icon: Sparkles,
    color: 'text-blue-400 bg-blue-500/10'
  },
  {
    id: 'groq',
    name: 'Groq LPU (GPT-OSS-120B)',
    badge: 'Fastest',
    description: 'Ultra-fast LPU inference, syntax precision & native Python code runner',
    icon: Zap,
    color: 'text-amber-400 bg-amber-500/10'
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o-mini)',
    badge: 'Reasoning',
    description: 'Deep chain-of-thought logic, multi-step math, and architectural reasoning',
    icon: Brain,
    color: 'text-emerald-400 bg-emerald-500/10'
  },
  {
    id: 'gemini',
    name: 'Gemini (2.5 Flash)',
    badge: 'Multimodal',
    description: 'Google high-context window, factual recall & web knowledge',
    icon: Globe2,
    color: 'text-purple-400 bg-purple-500/10'
  }
];

export default function ModelSelector({ selectedModel, onSelectModel }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const current = MODELS.find(m => m.id === selectedModel) || MODELS[0];
  const Icon = current.icon;

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1e1e1e] hover:bg-[#262626] border border-[#2f2f2f] text-xs font-medium text-neutral-200 transition-all shadow-sm"
      >
        <Icon className={`w-3.5 h-3.5 ${current.color.split(' ')[0]}`} />
        <span>{current.name.split(' ')[0]}</span>
        <span className="text-[10px] text-neutral-400">({current.badge})</span>
        <ChevronDown className="w-3.5 h-3.5 text-neutral-400 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-[#1c1c1c] border border-[#2e2e2e] shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
            Model Engine Selection
          </div>
          <div className="space-y-1">
            {MODELS.map((m) => {
              const MIcon = m.icon;
              const isSelected = m.id === selectedModel;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelectModel(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all ${
                    isSelected ? 'bg-[#2a2a2a] text-white' : 'hover:bg-[#242424] text-neutral-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${m.color}`}>
                    <MIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#141414] text-neutral-400 font-mono">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 line-clamp-2 mt-0.5 leading-snug">
                      {m.description}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-400 shrink-0 self-center" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
