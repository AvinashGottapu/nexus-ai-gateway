import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

export function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#303030] bg-[#141414] font-mono text-sm shadow-xl">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-[#2d2d2d] text-xs text-neutral-400">
        <div className="flex items-center gap-1.5 font-medium tracking-wide">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span>{language || 'code'}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs py-1 px-2.5 rounded-md hover:bg-[#2b2b2b] text-neutral-300 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-[#d4d4d4] leading-relaxed">
        <pre><code>{code}</code></pre>
      </div>
    </div>
  );
}

export function FormattedMarkdown({ content }) {
  if (!content) return null;

  // Split by code blocks ```lang ... ```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 leading-relaxed text-[15px] text-neutral-200">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          let lang = 'text';
          let code = '';
          if (lines.length > 0 && /^[a-zA-Z0-9_\-#+]+$/.test(lines[0].trim())) {
            lang = lines[0].trim();
            code = lines.slice(1).join('\n');
          } else {
            code = lines.join('\n');
          }
          return <CodeBlock key={index} language={lang} code={code} />;
        }

        // Parse regular markdown lines
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-2" />;

              // Headings
              if (trimmed.startsWith('### ')) {
                return <h3 key={lIdx} className="text-lg font-semibold text-white mt-4 mb-2">{trimmed.slice(4)}</h3>;
              }
              if (trimmed.startsWith('## ')) {
                return <h2 key={lIdx} className="text-xl font-bold text-white mt-5 mb-2">{trimmed.slice(3)}</h2>;
              }
              if (trimmed.startsWith('# ')) {
                return <h1 key={lIdx} className="text-2xl font-extrabold text-white mt-6 mb-3">{trimmed.slice(2)}</h1>;
              }

              // Bullet points
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2.5 ml-2">
                    <span className="text-blue-400 mt-1 font-bold text-sm">•</span>
                    <span>{parseInlineFormatting(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Numbered list
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lIdx} className="flex items-start gap-2.5 ml-2">
                    <span className="text-neutral-400 font-semibold min-w-[1.2rem]">{numMatch[1]}.</span>
                    <span>{parseInlineFormatting(numMatch[2])}</span>
                  </div>
                );
              }

              // Normal paragraph
              return <p key={lIdx}>{parseInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function parseInlineFormatting(text) {
  // Bold **text**
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith('**') && bPart.endsWith('**')) {
      return <strong key={bIdx} className="font-semibold text-white">{bPart.slice(2, -2)}</strong>;
    }
    // Inline code `code`
    const codeParts = bPart.split(/(`.*?`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith('`') && cPart.endsWith('`')) {
        return (
          <code key={cIdx} className="px-1.5 py-0.5 rounded bg-[#242424] text-sky-300 font-mono text-xs border border-[#333]">
            {cPart.slice(1, -1)}
          </code>
        );
      }
      return cPart;
    });
  });
}
