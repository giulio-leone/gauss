import { useState, useEffect } from "react";
import { AgentList } from "./components/AgentList";
import { AgentChat } from "./components/AgentChat";

interface Agent {
  name: string;
  description: string;
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{
        width: 280,
        borderRight: "1px solid #30363d",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        background: "#161b22",
      }}>
        <h1 style={{ fontSize: 18, marginBottom: 16, color: "#58a6ff" }}>
          ⚡ GaussFlow Playground
        </h1>
        {error && <div style={{ color: "#f85149", marginBottom: 8 }}>{error}</div>}
        <AgentList agents={agents} selected={selected} onSelect={setSelected} />
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {selected ? (
          <AgentChat agentName={selected} />
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8b949e" }}>
            Select an agent to start chatting
          </div>
        )}
      </main>
    </div>
  );
}
