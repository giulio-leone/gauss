import { describe, it, expect, vi } from "vitest";
import type { LanguageModel } from "../core/llm/index.js";
import { Agent } from "../index.js";
import type { LifecycleHooks } from "../agent/lifecycle.js";

describe("Agent Lifecycle", () => {
  const mockModel = {
    modelId: "mock-model",
    specificationVersion: "v2",
  } as LanguageModel;

  describe("Basic Lifecycle Operations", () => {
    it("should start and shutdown agent with default hooks", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent",
      }).build();

      expect(agent.isReady).toBe(false);
      expect(agent.isShuttingDown).toBe(false);

      await agent.startup();
      expect(agent.isReady).toBe(true);
      expect(agent.isShuttingDown).toBe(false);

      await agent.shutdown();
      expect(agent.isReady).toBe(false);
      expect(agent.isShuttingDown).toBe(true);

      await agent.dispose();
    });

    it("should return healthy status for a ready agent", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent",
      }).build();

      await agent.startup();
      const healthStatus = await agent.healthCheck();
      
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.details?.lifecycle?.status).toBe('up');
      expect(healthStatus.details?.lifecycle?.message).toBe('Agent is ready');

      await agent.dispose();
    });

    it("should return unhealthy status for a not-started agent", async () => {
      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent",
      }).build();

      const healthStatus = await agent.healthCheck();
      
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.details?.lifecycle?.status).toBe('down');
      expect(healthStatus.details?.lifecycle?.message).toBe('Agent not started');

      await agent.dispose();
    });
  });

  describe("Custom Lifecycle Hooks", () => {
    it("should call custom lifecycle hooks", async () => {
      const onStartup = vi.fn();
      const onShutdown = vi.fn();
      const onHealthCheck = vi.fn().mockResolvedValue({
        healthy: true,
        details: { custom: { status: 'up', message: 'Custom health check' } }
      });

      const hooks: LifecycleHooks = {
        onStartup,
        onShutdown,
        onHealthCheck,
      };

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent with hooks",
      })
        .withLifecycle(hooks)
        .build();

      await agent.startup();
      expect(onStartup).toHaveBeenCalledTimes(1);

      const healthStatus = await agent.healthCheck();
      expect(onHealthCheck).toHaveBeenCalledTimes(1);
      expect(healthStatus.healthy).toBe(true);
      expect(healthStatus.details?.custom?.message).toBe('Custom health check');

      await agent.shutdown();
      expect(onShutdown).toHaveBeenCalledTimes(1);

      await agent.dispose();
    });

    it("should handle startup hook errors", async () => {
      const onStartup = vi.fn().mockRejectedValue(new Error("Startup failed"));
      
      const hooks: LifecycleHooks = {
        onStartup,
      };

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent with failing startup",
      })
        .withLifecycle(hooks)
        .build();

      await expect(agent.startup()).rejects.toThrow("Startup failed");
      expect(agent.isReady).toBe(false);

      await agent.dispose();
    });

    it("should call shutdown through dispose", async () => {
      const onShutdown = vi.fn();
      
      const hooks: LifecycleHooks = {
        onShutdown,
      };

      const agent = Agent.create({
        model: mockModel,
        instructions: "Test agent with shutdown hook",
      })
        .withLifecycle(hooks)
        .build();

      await agent.startup();
      await agent.dispose(); // This should call shutdown internally

      expect(onShutdown).toHaveBeenCalledTimes(1);
    });
  });
});