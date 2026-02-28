import { describe, it, expect } from "vitest";
import { AgentBuilderAPI } from "../agent-builder-api.js";
import { ModelRegistry } from "../visual-agent-builder.js";

const registry = new ModelRegistry();
const mockModel = { modelId: "test" } as any;
registry.register("test-model", mockModel);

const validConfig = {
  id: "test-agent",
  name: "Test Agent",
  nodes: [
    { id: "start", type: "transform", instructions: "Hello:" },
  ],
  edges: [],
  entryNode: "start",
};

describe("AgentBuilderAPI", () => {
  it("creates an agent (POST /agents)", async () => {
    const api = new AgentBuilderAPI({ registry });
    const res = await api.createAgent(validConfig);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("test-agent");
    expect(res.body.nodes).toBe(1);
  });

  it("rejects invalid config", async () => {
    const api = new AgentBuilderAPI({ registry });
    const res = await api.createAgent({ id: "bad" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid config");
  });

  it("lists agents (GET /agents)", async () => {
    const api = new AgentBuilderAPI({ registry });
    await api.createAgent(validConfig);
    const res = api.listAgents();
    expect(res.status).toBe(200);
    expect((res.body as any).count).toBe(1);
  });

  it("gets agent by id (GET /agents/:id)", async () => {
    const api = new AgentBuilderAPI({ registry });
    await api.createAgent(validConfig);
    const res = api.getAgent("test-agent");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Agent");
  });

  it("returns 404 for unknown agent", () => {
    const api = new AgentBuilderAPI({ registry });
    expect(api.getAgent("ghost").status).toBe(404);
  });

  it("runs an agent (POST /agents/:id/run)", async () => {
    const api = new AgentBuilderAPI({ registry });
    await api.createAgent(validConfig);
    const res = await api.runAgent("test-agent", "world");
    expect(res.status).toBe(200);
    expect(res.body.output).toBe("Hello:\nworld");
  });

  it("returns 404 when running unknown agent", async () => {
    const api = new AgentBuilderAPI({ registry });
    const res = await api.runAgent("ghost", "test");
    expect(res.status).toBe(404);
  });

  it("deletes an agent (DELETE /agents/:id)", async () => {
    const api = new AgentBuilderAPI({ registry });
    await api.createAgent(validConfig);
    const res = api.deleteAgent("test-agent");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe("test-agent");
    expect(api.getAgent("test-agent").status).toBe(404);
  });
});
