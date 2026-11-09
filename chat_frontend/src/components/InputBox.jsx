import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUp, 
  Square, 
  Plus, 
  Lightbulb, 
  Mic, 
  FileText, 
  X, 
  Sparkles,
  Paperclip
} from 'lucide-react';

export default function InputBox({ 
  onSend, 
  isStreaming, 
  onStop, 
  thinkMode, 
  onToggleThinkMode,
  activeDocument,
  onAttachDocument,
  onRemoveDocument
}) {
  const [text, setText] = useState('');
  const [showDocModal, setShowDocModal] = useState(false);
  const [docContent, setDocContent] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if ((!text.trim() && !activeDocument) || isStreaming) return;
    onSend(text);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSaveDoc = () => {
    if (docContent.trim()) {
      onAttachDocument(docContent);
      setDocContent('');
      setShowDocModal(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {/* Attached Document Pill (RAG indicator) */}
      {activeDocument && (
        <div className="mb-2 flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#1e293b] border border-[#3b82f6]/40 text-blue-300 text-xs shadow-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2 truncate">
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="font-medium truncate">Temporary Knowledge attached for 2-Stage RAG:</span>
            <span className="text-neutral-400 truncate max-w-xs">{activeDocument.slice(0, 60)}...</span>
          </div>
          <button
            onClick={onRemoveDocument}
            className="p-1 rounded-md hover:bg-[#334155] text-neutral-400 hover:text-white transition-colors"
            title="Remove document"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Capsule Input Bar (Matching ChatGPT & Gemini screenshots) */}
      <div className="relative rounded-3xl bg-[#212121] border border-[#383838] focus-within:border-[#525252] shadow-2xl transition-all">
        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Nexus AI or give a coding/reasoning task..."
          rows={1}
          disabled={isStreaming}
          className="w-full bg-transparent px-5 pt-4 pb-12 text-[#ececec] placeholder-neutral-500 text-sm md:text-base focus:outline-none resize-none max-h-52 leading-relaxed"
        />

        {/* Bottom Action Controls inside Pill */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between select-none">
          {/* Left Controls: Plus/Attach & Think Button */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowDocModal(true)}
              className="p-2 rounded-full hover:bg-[#2e2e2e] text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Attach Document for RAG Context"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Think Button (ChatGPT Style in screenshot) */}
            <button
              type="button"
              onClick={onToggleThinkMode}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                thinkMode
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-[#2b2b2b]'
              }`}
              title="Enable Deep Chain-of-Thought Reasoning"
            >
              <Lightbulb className={`w-3.5 h-3.5 ${thinkMode ? 'text-blue-400' : 'text-neutral-400'}`} />
              <span>Think</span>
            </button>
          </div>

          {/* Right Controls: Mic & Send/Stop Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-2 rounded-full hover:bg-[#2e2e2e] text-neutral-400 hover:text-neutral-200 transition-colors hidden sm:flex"
              title="Voice mode"
            >
              <Mic className="w-4 h-4" />
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="w-8 h-8 rounded-full bg-neutral-200 hover:bg-white text-black flex items-center justify-center transition-all shadow-md"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-black" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!text.trim() && !activeDocument}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md ${
                  text.trim() || activeDocument
                    ? 'bg-white hover:bg-neutral-200 text-black cursor-pointer'
                    : 'bg-[#2e2e2e] text-neutral-600 cursor-not-allowed'
                }`}
                title="Send prompt"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[11px] text-neutral-400 mt-2 tracking-wide font-normal">
        Nexus AI is powered by multi-provider LPU routing & native Python execution. Verify important info.
      </div>

      {/* RAG Knowledge Attachment Modal */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1c1c1c] border border-[#2e2e2e] rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#2d2d2d]">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <Paperclip className="w-4 h-4 text-blue-400" />
                <span>Attach Temporary Knowledge (2-Stage RAG)</span>
              </div>
              <button
                onClick={() => setShowDocModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-[#2b2b2b]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-400 my-3 leading-relaxed">
              Paste knowledge, notes, or policy documents. It will be indexed in Upstash Redis and retrieved with BM25 + Dense Vectors + Cross-Encoder re-ranking.
            </p>
            <textarea
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Paste custom document text here..."
              rows={6}
              className="w-full bg-[#141414] border border-[#2d2d2d] rounded-xl p-3 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500 font-mono"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowDocModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-[#262626] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDoc}
                disabled={!docContent.trim()}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                Attach Context
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
