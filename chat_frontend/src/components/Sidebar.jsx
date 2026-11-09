import React, { useState } from 'react';
import { 
  Plus, 
  MessageSquare, 
  PanelLeftClose, 
  PanelLeft, 
  Trash2, 
  MoreVertical, 
  Sparkles, 
  Settings, 
  ExternalLink,
  Code2,
  Cpu,
  ShieldCheck
} from 'lucide-react';

export default function Sidebar({ 
  chats, 
  activeChatId, 
  onSelectChat, 
  onNewChat, 
  onDeleteChat,
  isOpen,
  onToggleOpen 
}) {
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [menuOpenChatId, setMenuOpenChatId] = useState(null);

  if (!isOpen) {
    return (
      <div className="fixed top-3 left-3 z-30">
        <button
          onClick={onToggleOpen}
          className="p-2.5 rounded-xl bg-[#171717]/90 hover:bg-[#252525] border border-[#2e2e2e] text-neutral-300 hover:text-white transition-all shadow-lg backdrop-blur-md"
          title="Open Sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-64 md:w-72 h-screen bg-[#171717] border-r border-[#262626] flex flex-col justify-between select-none z-20 shrink-0 transition-all duration-200">
      {/* Top Header */}
      <div className="p-3.5 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-white block">Nexus AI</span>
              <span className="text-[10px] text-neutral-400 font-mono tracking-wider block -mt-0.5">GATEWAY APP</span>
            </div>
          </div>
          <button
            onClick={onToggleOpen}
            className="p-1.5 rounded-lg hover:bg-[#242424] text-neutral-400 hover:text-white transition-colors"
            title="Close sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* New Chat Button (Pill style like ChatGPT/Gemini) */}
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#212121] hover:bg-[#2a2a2a] border border-[#2e2e2e] text-neutral-200 hover:text-white font-medium text-sm transition-all shadow-sm group"
        >
          <div className="flex items-center gap-2.5">
            <Plus className="w-4 h-4 text-neutral-400 group-hover:text-blue-400 transition-colors" />
            <span>New chat</span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono px-1.5 py-0.5 rounded bg-[#171717]">Ctrl+N</span>
        </button>
      </div>

      {/* Recents Chat List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Recents
        </div>

        {chats.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-neutral-500">
            No past conversations yet.<br />Start a new conversation above!
          </div>
        ) : (
          chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <div
                key={chat.id}
                onMouseEnter={() => setHoveredChatId(chat.id)}
                onMouseLeave={() => {
                  setHoveredChatId(null);
                  if (menuOpenChatId === chat.id) setMenuOpenChatId(null);
                }}
                className="relative group"
              >
                <button
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-medium transition-all ${
                    isActive 
                      ? 'bg-[#262626] text-white shadow-sm font-semibold' 
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#1f1f1f]'
                  }`}
                >
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-neutral-500'}`} />
                  <span className="truncate pr-5 flex-1">{chat.title || 'New Conversation'}</span>
                </button>

                {/* Quick delete on hover */}
                {(hoveredChatId === chat.id || isActive) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 hover:text-rose-400 hover:bg-[#333] transition-colors"
                    title="Delete chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom User Profile Section (Matching ChatGPT/Gemini bottom bar) */}
      <div className="p-3 border-t border-[#262626] space-y-2">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-[#212121] transition-colors cursor-pointer group">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-xs font-bold text-white shadow">
              AG
            </div>
            <div>
              <div className="text-xs font-semibold text-white group-hover:text-blue-400 transition-colors">
                Avinash Gottapu
              </div>
              <div className="text-[10px] text-neutral-400 flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Enterprise Pro
              </div>
            </div>
          </div>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-[#2e2e2e] transition-colors"
            title="Open Gateway Admin Studio (Port 3001)"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </aside>
  );
}
