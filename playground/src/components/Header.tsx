import type { ConnectionStatus } from '../types';

interface HeaderProps {
  connected: boolean;
  agentCount: number;
}

export function Header({ connected, agentCount }: HeaderProps) {
  const status: ConnectionStatus = connected ? 'connected' : 'disconnected';

  return (
    <header className="pg-header">
      <div className="pg-header-left">
        <h1 className="pg-header-title">⚡ Gauss Playground</h1>
      </div>
      <div className="pg-header-right">
        <span className="pg-header-agents">{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
        <span className={`pg-connection-badge pg-connection-badge--${status}`}>
          <span className="pg-connection-dot" />
          {status === 'connected' ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </header>
  );
}
