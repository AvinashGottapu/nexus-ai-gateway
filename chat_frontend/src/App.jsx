import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ModelSelector from './components/ModelSelector';
import ChatArea from './components/ChatArea';
import InputBox from './components/InputBox';
import { Sparkles, Activity, ShieldCheck, ExternalLink } from 'lucide-react';

const STORAGE_KEY = 'nexus_consumer_chats_v1';

export default function App() {
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    return chats.length > 0 ? chats[0].id : null;
  });

  const [selectedModel, setSelectedModel] = useState('auto');
  const [thinkMode, setThinkMode] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeDocument, setActiveDocument] = useState(null);
  const abortControllerRef = useRef(null);

  // Sync chats to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (e) {
      console.error('Failed to save chats to localStorage', e);
    }
  }, [chats]);

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const messages = activeChat?.messages || [];

  // Create a new chat session
  const handleNewChat = () => {
    const newChatId = `chat_${Date.now()}`;
    const newChat = {
      id: newChatId,
      title: 'New chat',
      messages: [],
      createdAt: new Date().toISOString()
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChatId);
    setActiveDocument(null);
  };

  // Delete a chat session
  const handleDeleteChat = (chatId) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  // Keyboard shortcut Ctrl+N for new chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Send Prompt to Backend Gateway
  const handleSendPrompt = async (promptText) => {
    if (!promptText.trim() && !activeDocument) return;

    let currentChatId = activeChatId;

    // Create chat if none exists
    if (!currentChatId || !activeChat) {
      currentChatId = `chat_${Date.now()}`;
      const newChat = {
        id: currentChatId,
        title: promptText.slice(0, 32) || 'New chat',
        messages: [],
        createdAt: new Date().toISOString()
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(currentChatId);
    }

    const userMessage = {
      role: 'user',
      content: promptText,
      timestamp: new Date().toISOString()
    };

    // Update active chat title if first message
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const isFirstMessage = chat.messages.length === 0;
        const newTitle = isFirstMessage ? (promptText.slice(0, 36) + (promptText.length > 36 ? '...' : '')) : chat.title;
        return {
          ...chat,
          title: newTitle,
          messages: [...chat.messages, userMessage]
        };
      }
      return chat;
    }));

    // Ingest temporary knowledge into Redis RAG if attached
    if (activeDocument) {
      try {
        await fetch('/rag/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: activeDocument,
            source_name: 'consumer_attachment'
          })
        });
      } catch (e) {
        console.warn('RAG auto-ingest notice:', e);
      }
    }

    // Add placeholder assistant message
    const placeholderAssistant = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      metadata: null
    };

    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        return {
          ...chat,
          messages: [...chat.messages, placeholderAssistant]
        };
      }
      return chat;
    }));

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history payload
      const historyPayload = (activeChat?.messages || []).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Call Backend Gateway /chat endpoint
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          prompt: thinkMode ? `Think deeply and solve step-by-step: ${promptText}` : promptText,
          model: selectedModel,
          chat_history: historyPayload
        })
      });

      if (!response.ok) {
        throw new Error(`Gateway returned HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update assistant message with completed answer and metadata
      setChats(prev => prev.map(chat => {
        if (chat.id === currentChatId) {
          const updatedMessages = [...chat.messages];
          const lastIdx = updatedMessages.length - 1;
          if (lastIdx >= 0) {
            updatedMessages[lastIdx] = {
              role: 'assistant',
              content: data.response || 'No response returned from gateway.',
              timestamp: new Date().toISOString(),
              metadata: {
                provider_used: data.provider_used || data.provider,
                sub_intent: data.sub_intent,
                intent: data.intent,
                auto_rag_promoted: data.auto_rag_promoted,
                mcp_tools_executed: data.mcp_tools_executed || [],
                savings_badge: data.savings_badge,
                timings: data.timings_ms,
                cache: data.cache
              }
            };
          }
          return { ...chat, messages: updatedMessages };
        }
        return chat;
      }));

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream stopped by user');
      } else {
        console.error('Chat error:', err);
        setChats(prev => prev.map(chat => {
          if (chat.id === currentChatId) {
            const updatedMessages = [...chat.messages];
            const lastIdx = updatedMessages.length - 1;
            if (lastIdx >= 0) {
              updatedMessages[lastIdx] = {
                role: 'assistant',
                content: `⚠️ Gateway Connection Notice: ${err.message || 'Could not connect to backend server'}. Make sure your backend server is running on port 8000.`,
                timestamp: new Date().toISOString()
              };
            }
            return { ...chat, messages: updatedMessages };
          }
          return chat;
        }));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRegenerate = () => {
    if (messages.length < 2) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      // Remove last assistant message
      setChats(prev => prev.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            messages: chat.messages.slice(0, -1)
          };
        }
        return chat;
      }));
      handleSendPrompt(lastUserMsg.content);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-[#ececec]">
      {/* Left Collapsible Sidebar (Matches ChatGPT/Gemini) */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={(id) => setActiveChatId(id)}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Chat Canvas */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-[#212121] flex items-center justify-between px-4 md:px-6 z-10 shrink-0 bg-[#0d0d0d]/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Model Selector Dropdown (Gemini Flash-Lite ⌄ style) */}
            <ModelSelector
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
            />
          </div>

          <div className="flex items-center gap-2.5">
            {/* Gateway Telemetry Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#171717] border border-[#2b2b2b] text-[11px] text-neutral-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Gateway: Online</span>
            </div>

            {/* Link to Admin Studio */}
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1e1e1e] hover:bg-[#262626] border border-[#303030] text-xs font-medium text-neutral-300 hover:text-white transition-all shadow-sm"
              title="Open Admin Gateway Studio"
            >
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin Studio</span>
              <ExternalLink className="w-3 h-3 text-neutral-500" />
            </a>
          </div>
        </header>

        {/* Scrollable Conversation Stream */}
        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onSendSuggestion={handleSendPrompt}
          onRegenerate={handleRegenerate}
        />

        {/* Floating Bottom Input Pill */}
        <InputBox
          onSend={handleSendPrompt}
          isStreaming={isStreaming}
          onStop={handleStop}
          thinkMode={thinkMode}
          onToggleThinkMode={() => setThinkMode(!thinkMode)}
          activeDocument={activeDocument}
          onAttachDocument={setActiveDocument}
          onRemoveDocument={() => setActiveDocument(null)}
        />
      </div>
    </div>
  );
}
