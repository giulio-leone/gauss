import type { ExecutionMetrics } from '../types';

interface MetricsPanelProps {
  metrics: ExecutionMetrics;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <div className="pg-metrics">
      <div className="pg-metrics-grid">
        <MetricCard
          label="Total Tokens"
          value={formatNumber(metrics.totalTokens)}
          icon="🔤"
        />
        <MetricCard
          label="Prompt Tokens"
          value={formatNumber(metrics.promptTokens)}
          icon="📥"
        />
        <MetricCard
          label="Completion Tokens"
          value={formatNumber(metrics.completionTokens)}
          icon="📤"
        />
        <MetricCard
          label="Latency"
          value={formatLatency(metrics.totalLatencyMs)}
          icon="⏱️"
        />
        <MetricCard
          label="Tool Calls"
          value={String(metrics.toolCallCount)}
          icon="🔧"
        />
        <MetricCard
          label="Est. Cost"
          value={`$${metrics.estimatedCost.toFixed(4)}`}
          icon="💰"
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="pg-metric-card">
      <div className="pg-metric-icon">{icon}</div>
      <div className="pg-metric-info">
        <div className="pg-metric-value">{value}</div>
        <div className="pg-metric-label">{label}</div>
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
