interface Agent {
  name: string;
  description: string;
}

interface AgentListProps {
  agents: Agent[];
  selected: string | null;
  onSelect: (name: string) => void;
}

export function AgentList({ agents, selected, onSelect }: AgentListProps) {
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
        Agents ({agents.length})
      </div>
      {agents.map((agent) => (
        <button
          key={agent.name}
          onClick={() => onSelect(agent.name)}
          style={{
            display: "block",
            width: "100%",
            padding: "10px 12px",
            marginBottom: 4,
            border: "none",
            borderRadius: 6,
            background: selected === agent.name ? "#1f6feb" : "transparent",
            color: selected === agent.name ? "#fff" : "#c9d1d9",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 600 }}>{agent.name}</div>
          {agent.description && (
            <div style={{ fontSize: 12, color: selected === agent.name ? "#c9d1d9" : "#8b949e", marginTop: 2 }}>
              {agent.description}
            </div>
          )}
        </button>
      ))}
      {agents.length === 0 && (
        <div style={{ color: "#8b949e", fontSize: 13, padding: 8 }}>
          No agents registered. Register agents via the PlaygroundAPI.
        </div>
      )}
    </div>
  );
}
