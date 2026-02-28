import type { TimelineEntry } from '../types';

interface ExecutionTimelineProps {
  entries: TimelineEntry[];
}

export function ExecutionTimeline({ entries }: ExecutionTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="pg-timeline">
        <p className="pg-muted">No steps yet. Send a message to begin.</p>
      </div>
    );
  }

  return (
    <div className="pg-timeline">
      <div className="pg-timeline-list">
        {entries.map((entry, i) => (
          <div key={i} className={`pg-timeline-entry pg-timeline-entry--${entry.type}`}>
            <div className="pg-timeline-dot" />
            <div className="pg-timeline-content">
              <div className="pg-timeline-header">
                <span className="pg-timeline-type">{formatType(entry.type)}</span>
                {entry.durationMs != null && (
                  <span className="pg-timeline-duration">{entry.durationMs}ms</span>
                )}
              </div>
              <div className="pg-timeline-detail">{entry.label}</div>
              <div className="pg-timeline-time">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatType(type: string): string {
  switch (type) {
    case 'text': return '📝 Text';
    case 'tool_call': return '🔧 Tool Call';
    case 'tool_result': return '✅ Result';
    case 'error': return '❌ Error';
    case 'done': return '🏁 Done';
    default: return type;
  }
}
