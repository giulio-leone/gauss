// =============================================================================
// PrometheusMetricsAdapter — Prometheus-format metrics exporter
// =============================================================================

import type { MetricsPort } from "../../ports/metrics.port.js";

interface MetricEntry {
  type: "counter" | "gauge" | "histogram";
  value: number;
  labels: Record<string, string>;
  updatedAt: number;
}

interface HistogramBucket {
  le: number;
  count: number;
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export class PrometheusMetricsAdapter implements MetricsPort {
  private readonly counters = new Map<string, MetricEntry[]>();
  private readonly gauges = new Map<string, MetricEntry[]>();
  private readonly histograms = new Map<string, { sum: number; count: number; buckets: HistogramBucket[]; labels: Record<string, string> }[]>();
  private readonly buckets: number[];

  constructor(options?: { buckets?: number[] }) {
    this.buckets = options?.buckets ?? DEFAULT_BUCKETS;
  }

  incrementCounter(name: string, value = 1, labels: Record<string, string> = {}): void {
    const entries = this.counters.get(name) ?? [];
    const existing = entries.find((e) => labelsMatch(e.labels, labels));
    if (existing) {
      existing.value += value;
      existing.updatedAt = Date.now();
    } else {
      entries.push({ type: "counter", value, labels, updatedAt: Date.now() });
      this.counters.set(name, entries);
    }
  }

  recordGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const entries = this.gauges.get(name) ?? [];
    const existing = entries.find((e) => labelsMatch(e.labels, labels));
    if (existing) {
      existing.value = value;
      existing.updatedAt = Date.now();
    } else {
      entries.push({ type: "gauge", value, labels, updatedAt: Date.now() });
      this.gauges.set(name, entries);
    }
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const entries = this.histograms.get(name) ?? [];
    let existing = entries.find((e) => labelsMatch(e.labels, labels));
    if (!existing) {
      existing = {
        sum: 0,
        count: 0,
        buckets: this.buckets.map((le) => ({ le, count: 0 })),
        labels,
      };
      entries.push(existing);
      this.histograms.set(name, entries);
    }
    existing.sum += value;
    existing.count++;
    for (const bucket of existing.buckets) {
      if (value <= bucket.le) bucket.count++;
    }
  }

  /** Serialize all metrics to Prometheus exposition format */
  serialize(): string {
    const lines: string[] = [];

    for (const [name, entries] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const e of entries) {
        lines.push(`${name}${formatLabels(e.labels)} ${e.value}`);
      }
    }

    for (const [name, entries] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const e of entries) {
        lines.push(`${name}${formatLabels(e.labels)} ${e.value}`);
      }
    }

    for (const [name, entries] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const e of entries) {
        for (const b of e.buckets) {
          lines.push(`${name}_bucket${formatLabels({ ...e.labels, le: String(b.le) })} ${b.count}`);
        }
        lines.push(`${name}_bucket${formatLabels({ ...e.labels, le: "+Inf" })} ${e.count}`);
        lines.push(`${name}_sum${formatLabels(e.labels)} ${e.sum}`);
        lines.push(`${name}_count${formatLabels(e.labels)} ${e.count}`);
      }
    }

    return lines.join("\n");
  }

  /** Reset all metrics */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

function labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
}
