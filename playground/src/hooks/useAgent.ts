import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentInfo, ChatMessage, TimelineEntry, ToolCall, PlaygroundEvent } from '../types';

export function useAgent() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastToolCall, setLastToolCall] = useState<Map<string, ToolCall>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data: AgentInfo[]) => setAgents(data))
      .catch(() => {/* ignore */});
  }, []);

  const sendMessage = useCallback(
    async (agentId: string, prompt: string) => {
      if (isStreaming) return;

      setMessages((prev) => [...prev, { role: 'user', content: prompt, timestamp: Date.now() }]);
      setIsStreaming(true);

      const toolCalls: ToolCall[] = [];
      let assistantText = '';

      try {
        abortRef.current = new AbortController();
        const res = await fetch(`/api/agents/${agentId}/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const event: PlaygroundEvent = JSON.parse(json);
              processEvent(event, toolCalls, (text) => { assistantText = text; });

              // Update last tool call map for tool inspector
              if (event.type === 'tool_result' && event.name) {
                setLastToolCall((prev) => {
                  const next = new Map(prev);
                  next.set(event.name!, {
                    name: event.name!,
                    args: event.args,
                    result: event.result,
                    durationMs: event.durationMs,
                  });
                  return next;
                });
              }

              setTimeline((prev) => [
                ...prev,
                {
                  type: event.type,
                  label: eventLabel(event),
                  durationMs: event.durationMs ?? event.totalDurationMs,
                  timestamp: Date.now(),
                },
              ]);
            } catch {/* skip invalid JSON */}
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          assistantText = `Error: ${(err as Error).message}`;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          timestamp: Date.now(),
        },
      ]);
      setIsStreaming(false);
    },
    [isStreaming],
  );

  return { agents, messages, timeline, isStreaming, lastToolCall, sendMessage };
}

function processEvent(
  event: PlaygroundEvent,
  toolCalls: ToolCall[],
  setText: (text: string) => void,
): void {
  switch (event.type) {
    case 'text':
      setText(event.content ?? '');
      break;
    case 'tool_call':
      toolCalls.push({ name: event.name ?? 'unknown', args: event.args });
      break;
    case 'tool_result': {
      const existing = toolCalls.find((tc) => tc.name === event.name && tc.result === undefined);
      if (existing) {
        existing.result = event.result;
        existing.durationMs = event.durationMs;
      }
      break;
    }
    case 'error':
      setText(event.message ?? 'Unknown error');
      break;
  }
}

function eventLabel(event: PlaygroundEvent): string {
  switch (event.type) {
    case 'text': return (event.content ?? '').slice(0, 80);
    case 'tool_call': return `${event.name}(${JSON.stringify(event.args).slice(0, 60)})`;
    case 'tool_result': return `${event.name} → ${JSON.stringify(event.result).slice(0, 60)}`;
    case 'error': return event.message ?? 'Error';
    case 'done': return `Completed in ${event.totalDurationMs}ms`;
    default: return event.type;
  }
}
