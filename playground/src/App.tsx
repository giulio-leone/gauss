import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { AgentList } from './components/AgentList';
import { ChatPanel } from './components/ChatPanel';
import { ToolInspector } from './components/ToolInspector';
import { ExecutionTimeline } from './components/ExecutionTimeline';
import { MemoryViewer } from './components/MemoryViewer';
import { MetricsPanel } from './components/MetricsPanel';
import { useAgent } from './hooks/useAgent';
import { useWebSocket } from './hooks/useWebSocket';
import { useMetrics } from './hooks/useMetrics';
import type { AgentInfo } from './types';

type RightPanel = 'timeline' | 'memory' | 'metrics';

export function App() {
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('timeline');
  const [searchQuery, setSearchQuery] = useState('');

  const { agents, messages, timeline, isStreaming, lastToolCall, sendMessage } = useAgent();
  const { connected } = useWebSocket({ url: `ws://${window.location.host}/ws`, autoConnect: true });
  const metrics = useMetrics(timeline, messages);

  const handleSelectAgent = useCallback((agent: AgentInfo) => {
    setSelectedAgent(agent);
    setSelectedTool(null);
  }, []);

  const handleSend = useCallback(
    (prompt: string) => {
      if (selectedAgent) sendMessage(selectedAgent.id, prompt);
    },
    [selectedAgent, sendMessage],
  );

  const currentToolCall = selectedTool ? lastToolCall.get(selectedTool) ?? null : null;
  const currentTools = selectedAgent?.tools ?? [];

  const filteredAgents = searchQuery
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : agents;

  return (
    <div className="pg-app">
      <Header connected={connected} agentCount={agents.length} />

      <div className="pg-body">
        <aside className="pg-sidebar">
          <div className="pg-sidebar-search">
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pg-search-input"
            />
          </div>
          <AgentList
            agents={filteredAgents}
            selectedId={selectedAgent?.id ?? null}
            onSelect={handleSelectAgent}
          />
        </aside>

        <main className="pg-main">
          {selectedAgent ? (
            <>
              <div className="pg-chat-area">
                <ChatPanel
                  agentName={selectedAgent.name}
                  messages={messages}
                  isStreaming={isStreaming}
                  onSend={handleSend}
                />
              </div>

              <div className="pg-inspector-area">
                <div className="pg-panel-tabs">
                  <button
                    className={`pg-panel-tab ${rightPanel === 'timeline' ? 'pg-panel-tab--active' : ''}`}
                    onClick={() => setRightPanel('timeline')}
                  >
                    Timeline
                  </button>
                  <button
                    className={`pg-panel-tab ${rightPanel === 'memory' ? 'pg-panel-tab--active' : ''}`}
                    onClick={() => setRightPanel('memory')}
                  >
                    Memory
                  </button>
                  <button
                    className={`pg-panel-tab ${rightPanel === 'metrics' ? 'pg-panel-tab--active' : ''}`}
                    onClick={() => setRightPanel('metrics')}
                  >
                    Metrics
                  </button>
                </div>

                {rightPanel === 'timeline' && <ExecutionTimeline entries={timeline} />}
                {rightPanel === 'memory' && <MemoryViewer messages={messages} />}
                {rightPanel === 'metrics' && <MetricsPanel metrics={metrics} />}

                <ToolInspector
                  tools={currentTools}
                  selectedTool={selectedTool}
                  lastCall={currentToolCall}
                  onSelectTool={setSelectedTool}
                />
              </div>
            </>
          ) : (
            <div className="pg-empty-state">
              <div className="pg-empty-icon">⚡</div>
              <h2>Select an agent to begin</h2>
              <p>Choose an agent from the sidebar to start a conversation.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
