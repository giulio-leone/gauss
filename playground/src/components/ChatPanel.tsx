import { useState, useRef, useEffect } from 'react';
import type { ChatMessage, ToolCall } from '../types';

interface ChatPanelProps {
  agentName: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (prompt: string) => void;
}

export function ChatPanel({ agentName, messages, isStreaming, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    onSend(trimmed);
  };

  return (
    <div className="pg-chat">
      <div className="pg-chat-header">
        <h2>{agentName}</h2>
        {isStreaming && <span className="pg-streaming-indicator">● Streaming...</span>}
      </div>

      <div className="pg-chat-messages">
        {messages.length === 0 && (
          <div className="pg-chat-empty">
            <p>Send a message to start the conversation.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`pg-message pg-message--${msg.role}`}>
            <div className="pg-message-meta">
              <span className="pg-message-role">{msg.role === 'user' ? 'You' : agentName}</span>
              <span className="pg-message-time">{formatTime(msg.timestamp)}</span>
            </div>
            <div className="pg-message-content">
              <MessageContent content={msg.content} />
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="pg-tool-calls">
                  {msg.toolCalls.map((tc, j) => (
                    <ToolCallBlock key={j} {...tc} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="pg-chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isStreaming}
          autoFocus
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

/** Renders message content with basic markdown-like formatting for code blocks. */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx > 0 ? inner.slice(0, newlineIdx).trim() : '';
          const code = newlineIdx > 0 ? inner.slice(newlineIdx + 1) : inner;

          return (
            <div key={i} className="pg-code-block">
              {lang && <div className="pg-code-lang">{lang}</div>}
              <pre><code>{code}</code></pre>
            </div>
          );
        }

        // Inline code
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={i}>
            {inlineParts.map((ip, j) =>
              ip.startsWith('`') && ip.endsWith('`') ? (
                <code key={j} className="pg-inline-code">{ip.slice(1, -1)}</code>
              ) : (
                <span key={j}>{ip}</span>
              ),
            )}
          </span>
        );
      })}
    </>
  );
}

function ToolCallBlock({ name, args, result, durationMs }: ToolCall) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="pg-tool-call">
      <button className="pg-tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="pg-tool-call-icon">{expanded ? '▼' : '▶'}</span>
        <span className="pg-tool-call-name">🔧 {name}</span>
        {durationMs != null && <span className="pg-tool-call-duration">{durationMs}ms</span>}
      </button>
      {expanded && (
        <div className="pg-tool-call-body">
          <div className="pg-tool-call-section">
            <strong>Args:</strong>
            <pre><code>{JSON.stringify(args, null, 2)}</code></pre>
          </div>
          {result !== undefined && (
            <div className="pg-tool-call-section">
              <strong>Result:</strong>
              <pre><code>{JSON.stringify(result, null, 2)}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
