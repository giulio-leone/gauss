// =============================================================================
// SupervisorBuilder — Fluent builder for AgentSupervisor
// =============================================================================

import { AbstractBuilder } from "../utils/abstract-builder.js";
import { EventBus } from "../agent/event-bus.js";
import {
  AgentSupervisor,
  ChildSpec,
  RestartIntensity,
  SupervisorStrategy,
  SupervisorConfig,
} from "./agent-supervisor.js";

export class SupervisorBuilder extends AbstractBuilder<AgentSupervisor> {
  private readonly supervisorId: string;
  private supervisorStrategy: SupervisorStrategy = "one-for-one";
  private supervisorIntensity: RestartIntensity = { maxRestarts: 3, windowMs: 5000 };
  private readonly childSpecs: ChildSpec[] = [];
  private bus: EventBus | undefined;
  private parent: AgentSupervisor | undefined;
  private shutdownTimeoutMs: number | undefined;

  constructor(id: string) {
    super();
    this.supervisorId = id;
  }

  strategy(s: SupervisorStrategy): this {
    this.supervisorStrategy = s;
    return this;
  }

  intensity(maxRestarts: number, windowMs: number): this {
    this.supervisorIntensity = { maxRestarts, windowMs };
    return this;
  }

  child(spec: ChildSpec): this {
    this.childSpecs.push(spec);
    return this;
  }

  withEventBus(bus: EventBus): this {
    this.bus = bus;
    return this;
  }

  withParent(parent: AgentSupervisor): this {
    this.parent = parent;
    return this;
  }

  withShutdownTimeout(ms: number): this {
    this.shutdownTimeoutMs = ms;
    return this;
  }

  protected validate(): void {
    if (!this.supervisorId) {
      throw new Error("SupervisorBuilder: supervisor id is required");
    }
  }

  protected construct(): AgentSupervisor {
    const config: SupervisorConfig = {
      id: this.supervisorId,
      strategy: this.supervisorStrategy,
      intensity: this.supervisorIntensity,
      children: this.childSpecs,
      eventBus: this.bus,
      parentSupervisor: this.parent,
      shutdownTimeoutMs: this.shutdownTimeoutMs,
    };
    return new AgentSupervisor(config);
  }
}
