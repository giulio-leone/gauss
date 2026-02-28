import type { AgentInfo } from '../types';

interface AgentListProps {
  agents: AgentInfo[];
  selectedId: string | null;
  onSelect: (agent: AgentInfo) => void;
}

export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="pg-agent-list-empty">
        <p>No agents available</p>
      </div>
    );
  }

  return (
    <div className="pg-agent-list">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={`pg-agent-card ${selectedId === agent.id ? 'pg-agent-card--active' : ''}`}
          onClick={() => onSelect(agent)}
        >
          <div className="pg-agent-card-header">
            <span className="pg-agent-card-name">{agent.name}</span>
            <span className="pg-agent-card-badge">{agent.tools.length}</span>
          </div>
          {agent.description && (
            <div className="pg-agent-card-desc">{agent.description}</div>
          )}
        </button>
      ))}
    </div>
  );
}
