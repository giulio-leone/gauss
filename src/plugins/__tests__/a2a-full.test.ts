// =============================================================================
// A2A Full Protocol Test Suite
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { A2APlugin, type A2AAgentRuntime } from "../a2a.plugin.js";
import { A2ADelegationManager, type AgentCapability } from "../a2a-delegation.js";
import { A2APushNotifier } from "../a2a-push.js";
import type { A2ATaskEvent, A2ATask, A2AJsonRpcRequest } from "../a2a-handler.js";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-uuid-123' }
});

// Mock agent runtime
const createMockAgent = (result: string = "Mock result"): A2AAgentRuntime => ({
  sessionId: "test-session",
  run: vi.fn().mockResolvedValue({ text: result })
});

describe("A2ADelegationManager", () => {
  let delegationManager: A2ADelegationManager;

  beforeEach(() => {
    delegationManager = new A2ADelegationManager(mockFetch);
    mockFetch.mockClear();
  });

  it("should register and list agents", () => {
    const agent: AgentCapability = {
      name: "TestAgent",
      description: "Test agent",
      skills: ["coding", "analysis"],
      endpoint: "https://test.example.com/a2a"
    };

    delegationManager.register(agent);
    const agents = delegationManager.listAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toEqual(agent);
  });

  it("should unregister agents", () => {
    const agent: AgentCapability = {
      name: "TestAgent",
      description: "Test agent",
      skills: ["coding"],
      endpoint: "https://test.example.com/a2a"
    };

    delegationManager.register(agent);
    delegationManager.unregister("TestAgent");
    
    expect(delegationManager.listAgents()).toHaveLength(0);
  });

  it("should find best matching agent by skills", () => {
    const agent1: AgentCapability = {
      name: "CodingAgent",
      description: "Coding specialist",
      skills: ["javascript", "typescript", "react"],
      endpoint: "https://coding.example.com/a2a"
    };

    const agent2: AgentCapability = {
      name: "DataAgent",
      description: "Data specialist",
      skills: ["python", "sql", "analysis"],
      endpoint: "https://data.example.com/a2a"
    };

    delegationManager.register(agent1);
    delegationManager.register(agent2);

    const result = delegationManager.findAgent(["javascript", "react"]);
    expect(result?.name).toBe("CodingAgent");

    const result2 = delegationManager.findAgent(["python", "analysis"]);
    expect(result2?.name).toBe("DataAgent");
  });

  it("should delegate task to best agent", async () => {
    const agent: AgentCapability = {
      name: "TestAgent",
      description: "Test agent",
      skills: ["coding"],
      endpoint: "https://test.example.com/a2a"
    };

    delegationManager.register(agent);

    const mockTask: A2ATask = {
      id: "test-uuid-123",
      status: "completed",
      prompt: "Test prompt",
      output: "Test result",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:00:00.000Z"
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        jsonrpc: "2.0",
        id: "test-uuid-123",
        result: mockTask
      })
    });

    const result = await delegationManager.delegate("Test prompt", ["coding"]);

    expect(result.selectedAgent).toEqual(agent);
    expect(result.taskId).toBe("test-uuid-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.example.com/a2a",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "test-uuid-123",
          method: "tasks/send",
          params: {
            prompt: "Test prompt",
            taskId: "test-uuid-123",
            metadata: { delegatedSkills: ["coding"] }
          }
        })
      })
    );
  });
});

describe("A2APushNotifier", () => {
  let pushNotifier: A2APushNotifier;

  beforeEach(() => {
    pushNotifier = new A2APushNotifier(mockFetch);
    mockFetch.mockClear();
  });

  it("should subscribe and unsubscribe to push notifications", () => {
    const config = {
      url: "https://webhook.example.com/notify",
      headers: { "X-Webhook-Secret": "token123" },
      events: ["task:completed" as const]
    };

    pushNotifier.subscribe("task-123", config);
    pushNotifier.unsubscribe("task-123", "https://webhook.example.com/notify");
  });

  it("should send push notifications", async () => {
    const config = {
      url: "https://webhook.example.com/notify",
      events: ["task:completed" as const]
    };

    pushNotifier.subscribe("task-123", config);

    const event: A2ATaskEvent = {
      type: "task:completed",
      taskId: "task-123",
      task: {
        id: "task-123",
        status: "completed",
        prompt: "Test",
        output: "Result",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        completedAt: "2024-01-01T00:00:00.000Z"
      },
      timestamp: "2024-01-01T00:00:00.000Z"
    };

    mockFetch.mockResolvedValueOnce({ ok: true });

    await pushNotifier.notify(event);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://webhook.example.com/notify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
      })
    );
  });

  it("should filter events based on subscription", async () => {
    const config = {
      url: "https://webhook.example.com/notify",
      events: ["task:completed" as const]
    };

    pushNotifier.subscribe("task-123", config);

    const event: A2ATaskEvent = {
      type: "task:running",
      taskId: "task-123",
      task: {
        id: "task-123",
        status: "running",
        prompt: "Test",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z"
      },
      timestamp: "2024-01-01T00:00:00.000Z"
    };

    await pushNotifier.notify(event);

    // Should not call fetch because event type is not in subscription
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("A2APlugin Full Protocol", () => {
  let plugin: A2APlugin;
  let mockAgent: A2AAgentRuntime;

  beforeEach(() => {
    plugin = new A2APlugin({ fetch: mockFetch });
    mockAgent = createMockAgent();
    mockFetch.mockClear();
  });

  it("should have delegation tools", () => {
    expect(plugin.tools["a2a:delegate"]).toBeDefined();
    expect(plugin.tools["a2a:discover"]).toBeDefined();
    expect(plugin.tools["a2a:subscribe"]).toBeDefined();
  });

  it("should execute delegation tool", async () => {
    // Register a mock agent
    plugin.registerAgent({
      name: "TestAgent",
      description: "Test agent",
      skills: ["coding"],
      endpoint: "https://test.example.com/a2a"
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        jsonrpc: "2.0",
        id: "test-uuid-123",
        result: { id: "task-123", status: "completed" }
      })
    });

    const delegateTool = plugin.tools["a2a:delegate"] as {
      execute: (input: unknown, options: unknown) => Promise<any>;
    };

    const result = await delegateTool.execute({
      prompt: "Write some code",
      requiredSkills: ["coding"]
    }, {});

    expect(result).toBeDefined();
    expect(result.selectedAgent.name).toBe("TestAgent");
  });

  it("should execute discover tool", async () => {
    // Mock .well-known discovery
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        name: "DiscoveredAgent",
        description: "Agent discovered via well-known",
        skills: [{ name: "analysis" }],
        endpoint: "https://discovered.example.com/a2a"
      })
    });

    const discoverTool = plugin.tools["a2a:discover"] as {
      execute: (input: unknown, options: unknown) => Promise<any>;
    };

    const result = await discoverTool.execute({
      endpoint: "https://discovered.example.com/a2a"
    }, {});

    expect(result).toBeDefined();
    expect(result.name).toBe("DiscoveredAgent");
    expect(result.skills).toEqual(["analysis"]);
  });

  it("should handle agent discovery endpoint", async () => {
    const httpHandler = plugin.createHttpHandler(mockAgent);
    
    const request = new Request("https://example.com/.well-known/agent.json", {
      method: "GET"
    });

    const response = await httpHandler(request);
    expect(response.status).toBe(200);
    
    const agentCard = await response.json() as {
      name: string;
      capabilities: { streaming: boolean; pushNotifications: boolean };
    };
    expect(agentCard.name).toBeDefined();
    expect(agentCard.capabilities.streaming).toBe(true);
    expect(agentCard.capabilities.pushNotifications).toBe(true);
  });

  it("should emit task events", async () => {
    const events: A2ATaskEvent[] = [];
    plugin['taskEventListeners'].add((event) => events.push(event));

    // Directly test the task creation and event emission
    plugin['queueTask']("test-123", "Test prompt");
    const lease = plugin['markTaskRunning']("test-123");
    plugin['markTaskCompleted']("test-123", "Test result", lease?.leaseId);

    // Should have emitted queued, running, and completed events
    expect(events.length).toBe(3);
    expect(events[0].type).toBe("task:queued");
    expect(events[1].type).toBe("task:running");
    expect(events[2].type).toBe("task:completed");
  });

  it("should handle SSE task subscription", async () => {
    const jsonRpcHandler = plugin.createJsonRpcHandler(mockAgent);
    
    // Test that sendTaskSubscribe handler exists and works
    const handler = jsonRpcHandler as any;
    expect(handler.sendTaskSubscribe).toBeDefined();

    // We'll just check that the function exists and is callable
    // Full SSE testing would require more complex setup
    expect(typeof handler.sendTaskSubscribe).toBe("function");
  });

  it("should handle push notification subscription", () => {
    const config = {
      url: "https://webhook.example.com/notify",
      events: ["task:completed" as const]
    };

    plugin.subscribeToTaskNotifications("task-456", config);
    plugin.unsubscribeFromTaskNotifications("task-456", "https://webhook.example.com/notify");
  });

  it("should register and manage agents", () => {
    const agent: AgentCapability = {
      name: "TestAgent",
      description: "Test agent",
      skills: ["coding"],
      endpoint: "https://test.example.com/a2a"
    };

    plugin.registerAgent(agent);
    expect(plugin.listAgents()).toHaveLength(1);
    expect(plugin.listAgents()[0]).toEqual(agent);

    plugin.unregisterAgent("TestAgent");
    expect(plugin.listAgents()).toHaveLength(0);
  });
});

describe("SSE Response Creation", () => {
  it("should create proper SSE response format", async () => {
    const plugin = new A2APlugin({ fetch: mockFetch });
    const mockAgent = createMockAgent();
    const httpHandler = plugin.createHttpHandler(mockAgent);

    // Create a request that should trigger SSE
    const request = new Request("https://example.com/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sse-test",
        method: "tasks/sendSubscribe",
        params: { prompt: "Test SSE" }
      })
    });

    const response = await httpHandler(request);
    
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });
});