import React, { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignIn, useUser, useClerk, useAuth } from '@clerk/clerk-react';
import Sidebar from './components/Sidebar';
import ModelSelector from './components/ModelSelector';
import ChatArea from './components/ChatArea';
import InputBox from './components/InputBox';
import { Sparkles } from 'lucide-react';

const STORAGE_KEY = 'nexus_consumer_chats_v1';

export default function App() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const clerk = useClerk();

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

  // Sync chats to localStorage as immediate offline cache
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch (e) {
      console.error('Failed to save chats to localStorage', e);
    }
  }, [chats]);

  // Load past conversations from SQLite database for this Clerk user
  useEffect(() => {
    if (!user?.id) return;
    const fetchUserConversations = async () => {
      try {
        const res = await fetch(`/api/conversations?user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.conversations && data.conversations.length > 0) {
            setChats(prev => {
              // Merge remote conversations with any local unsaved chats
              const remoteIds = new Set(data.conversations.map(c => c.id));
              const localOnly = prev.filter(c => !remoteIds.has(c.id));
              const remoteChats = data.conversations.map(c => {
                const existing = prev.find(p => p.id === c.id);
                return {
                  id: c.id,
                  title: c.title,
                  createdAt: c.createdAt,
                  messages: existing?.messages || []
                };
              });
              return [...localOnly, ...remoteChats];
            });

            if (!activeChatId) {
              setActiveChatId(data.conversations[0].id);
              // Fetch first conversation's messages
              handleSelectChat(data.conversations[0].id);
            }
          }
        }
      } catch (err) {
        console.warn('Could not load past conversations from SQLite:', err);
      }
    };
    fetchUserConversations();
  }, [user?.id]);

  // Select a chat and pull its messages from SQLite if not yet loaded
  const handleSelectChat = async (chatId) => {
    setActiveChatId(chatId);
    const targetChat = chats.find(c => c.id === chatId);
    if (!targetChat || !targetChat.messages || targetChat.messages.length === 0) {
      try {
        const res = await fetch(`/api/conversations/${chatId}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: data.messages } : c));
          }
        }
      } catch (e) {
        console.warn('Failed to load conversation messages:', e);
      }
    }
  };

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

  // Delete a chat session from UI and SQLite database
  const handleDeleteChat = async (chatId) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) {
      const remaining = chats.filter(c => c.id !== chatId);
      setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
    }
    try {
      await fetch(`/api/conversations/${chatId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete conversation on server:', e);
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

      // Retrieve cryptographically signed Clerk JWT session token
      let token = null;
      try {
        token = await getToken();
      } catch (tokenErr) {
        console.warn('Could not retrieve Clerk JWT token, falling back to user ID:', tokenErr);
      }

      // Call Backend Gateway /chat endpoint with Clerk user authentication
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || user?.id || 'clerk_guest'}`
        },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          prompt: thinkMode ? `Think deeply and solve step-by-step: ${promptText}` : promptText,
          provider: selectedModel,
          session_id: currentChatId,
          user_id: user?.id || 'usr_anonymous',
          chat_history: historyPayload
        })
      });

      if (!response.ok) {
        let errDetail = `Gateway returned HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson?.detail) errDetail = errJson.detail;
        } catch {
          // ignore json parse error on non-json error responses
        }
        throw new Error(errDetail);
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
        console.log('Inference stopped by user.');
        return;
      }
      setChats(prev => prev.map(chat => {
        if (chat.id === currentChatId) {
          const updatedMessages = [...chat.messages];
          const lastIdx = updatedMessages.length - 1;
          if (lastIdx >= 0) {
            updatedMessages[lastIdx] = {
              role: 'assistant',
              content: `⚠️ Gateway Connection Notice: ${err.message}. Make sure your backend server is running on port 8000.`,
              timestamp: new Date().toISOString(),
              isError: true
            };
          }
          return { ...chat, messages: updatedMessages };
        }
        return chat;
      }));
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

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d0d0d]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* 1. Signed Out View: Clean Full-Screen Login with Clerk */}
      <SignedOut>
        <div className="flex h-screen w-screen items-center justify-center bg-[#0d0d0d] px-4 select-none relative overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-gradient-to-tr from-blue-600/15 via-indigo-600/10 to-purple-600/15 blur-[120px] pointer-events-none rounded-full" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/25">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">Nexus AI</span>
            </div>
            <SignIn 
              routing="hash"
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-[#161616] border border-[#272727] shadow-2xl rounded-3xl',
                  headerTitle: 'text-white font-bold',
                  headerSubtitle: 'text-neutral-400 text-xs',
                  socialButtonsBlockButton: 'bg-[#212121] border-[#333] hover:bg-[#2b2b2b] text-white',
                  formFieldInput: 'bg-[#101010] border-[#2c2c2c] text-white focus:border-blue-500',
                  formButtonPrimary: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/25',
                  footerActionLink: 'text-blue-400 hover:text-blue-300'
                }
              }}
            />
          </div>
        </div>
      </SignedOut>

      {/* 2. Signed In View: Full ChatGPT / Gemini Chat Workspace */}
      <SignedIn>
        <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d] text-[#ececec]">
          {/* Left Collapsible Sidebar */}
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            isOpen={sidebarOpen}
            onToggleOpen={() => setSidebarOpen(!sidebarOpen)}
            user={user}
            onLogout={() => clerk.signOut()}
          />

          {/* Main Chat Canvas */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {/* Top Header Bar */}
            <header className="h-14 border-b border-[#212121] flex items-center justify-between px-4 md:px-6 z-10 shrink-0 bg-[#0d0d0d]/80 backdrop-blur-md">
              <div className="flex items-center gap-3">
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

                {/* Link to Developer Portal (Port 3000) */}
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1e1e1e] hover:bg-[#262626] border border-[#303030] text-xs font-medium text-neutral-300 hover:text-white transition-all shadow-sm"
                  title="Open Developer Portal (Port 3000)"
                >
                  <span>Developer Keys</span>
                </a>
              </div>
            </header>

            {/* Scrollable Conversation Stream */}
            <ChatArea
              messages={messages}
              isStreaming={isStreaming}
              onSendSuggestion={handleSendPrompt}
              onRegenerate={handleRegenerate}
              userName={user?.firstName || user?.fullName?.split(' ')[0] || 'there'}
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
      </SignedIn>
    </>
  );
}
