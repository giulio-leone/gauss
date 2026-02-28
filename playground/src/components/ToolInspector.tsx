import type { ToolCall, ToolInfo } from '../types';

interface ToolInspectorProps {
  tools: ToolInfo[];
  selectedTool: string | null;
  lastCall: ToolCall | null;
  onSelectTool: (name: string | null) => void;
}

export function ToolInspector({ tools, selectedTool, lastCall, onSelectTool }: ToolInspectorProps) {
  if (tools.length === 0) {
    return (
      <div className="pg-tool-inspector">
        <h3>Tools</h3>
        <p className="pg-muted">No tools registered</p>
      </div>
    );
  }

  const selected = tools.find((t) => t.name === selectedTool);

  return (
    <div className="pg-tool-inspector">
      <h3>Tools</h3>
      <div className="pg-tool-list">
        {tools.map((tool) => (
          <button
            key={tool.name}
            className={`pg-tool-item ${selectedTool === tool.name ? 'pg-tool-item--active' : ''}`}
            onClick={() => onSelectTool(selectedTool === tool.name ? null : tool.name)}
            title={tool.description}
          >
            🔧 {tool.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="pg-tool-detail">
          <h4>{selected.name}</h4>
          {selected.description && <p>{selected.description}</p>}
          {selected.schema && (
            <div className="pg-tool-schema">
              <strong>Schema:</strong>
              <pre><code className="pg-json">{syntaxHighlight(selected.schema)}</code></pre>
            </div>
          )}
          {lastCall && (
            <div className="pg-tool-last-call">
              <strong>Last Call:</strong>
              <pre><code className="pg-json">{syntaxHighlight({ args: lastCall.args, result: lastCall.result, durationMs: lastCall.durationMs })}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Simple JSON syntax highlighting via HTML spans with class names. */
function syntaxHighlight(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="pg-json-key">"$1"</span>')
    .replace(/:\s*"([^"]*)"/g, ': <span class="pg-json-string">"$1"</span>')
    .replace(/:\s*(\d+\.?\d*)/g, ': <span class="pg-json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="pg-json-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="pg-json-null">$1</span>');
}
