import type { ChatMessage } from '../types';

interface MemoryViewerProps {
  messages: ChatMessage[];
}

export function MemoryViewer({ messages }: MemoryViewerProps) {
  if (messages.length === 0) {
    return (
      <div className="pg-memory">
        <p className="pg-muted">No conversation history yet.</p>
      </div>
    );
  }

  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const toolCallCount = messages.reduce(
    (sum, m) => sum + (m.toolCalls?.length ?? 0),
    0,
  );

  return (
    <div className="pg-memory">
      <div className="pg-memory-stats">
        <div className="pg-memory-stat">
          <span className="pg-memory-stat-value">{messages.length}</span>
          <span className="pg-memory-stat-label">Messages</span>
        </div>
        <div className="pg-memory-stat">
          <span className="pg-memory-stat-value">{toolCallCount}</span>
          <span className="pg-memory-stat-label">Tool Calls</span>
        </div>
        <div className="pg-memory-stat">
          <span className="pg-memory-stat-value">{formatSize(totalChars)}</span>
          <span className="pg-memory-stat-label">Context Size</span>
        </div>
      </div>

      <div className="pg-memory-entries">
        {messages.map((msg, i) => (
          <div key={i} className={`pg-memory-entry pg-memory-entry--${msg.role}`}>
            <div className="pg-memory-entry-header">
              <span className="pg-memory-entry-role">{msg.role}</span>
              <span className="pg-memory-entry-chars">{msg.content.length} chars</span>
            </div>
            <div className="pg-memory-entry-preview">
              {msg.content.slice(0, 120)}
              {msg.content.length > 120 ? '…' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars}`;
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}K`;
  return `${(chars / 1_000_000).toFixed(2)}M`;
}
