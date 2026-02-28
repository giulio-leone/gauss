import { describe, it, expect, vi, beforeEach } from "vitest";

import { GitHubRegistryAdapter } from "../github-registry.adapter.js";
import type { MarketplacePluginManifest } from "../../../ports/plugin-manifest.port.js";
import * as localCache from "../local-cache.js";

// ─── Mock local-cache ────────────────────────────────────────────────────────

vi.mock("../local-cache.js", () => ({
  saveManifest: vi.fn(),
  readInstalledManifests: vi.fn(() => []),
  removePluginDir: vi.fn(),
  getPluginDir: vi.fn((name: string) => `/home/user/.gauss/plugins/${name}`),
}));

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>();

vi.stubGlobal("fetch", mockFetch);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MANIFESTS: MarketplacePluginManifest[] = [
  {
    name: "plugin-a",
    version: "1.0.0",
    description: "A cool plugin",
    author: "author-a",
    entry: "./index.js",
    tags: ["cool", "testing"],
  },
  {
    name: "plugin-b",
    version: "2.0.0",
    description: "Another plugin for logging",
    author: "author-b",
    entry: "./main.js",
    tags: ["logging"],
    license: "MIT",
  },
];

function mockOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(data),
  } as Response;
}

function mockError(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve(null),
  } as Response;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GitHubRegistryAdapter", () => {
  let adapter: GitHubRegistryAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitHubRegistryAdapter({ registryUrl: "https://example.com/registry.json" });
  });

  // ─── search ──────────────────────────────────────────────────────────

  describe("search()", () => {
    it("finds matching plugins by name", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.search("plugin-a");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("plugin-a");
    });

    it("finds matching plugins by description", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.search("logging");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("plugin-b");
    });

    it("finds matching plugins by tags", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.search("cool");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("plugin-a");
    });

    it("returns empty array for no match", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.search("nonexistent");
      expect(result).toHaveLength(0);
    });
  });

  // ─── getManifest ─────────────────────────────────────────────────────

  describe("getManifest()", () => {
    it("returns correct plugin manifest", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.getManifest("plugin-b");
      expect(result).toEqual(MANIFESTS[1]);
    });

    it("returns null for unknown plugin", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      const result = await adapter.getManifest("unknown");
      expect(result).toBeNull();
    });
  });

  // ─── listInstalled ───────────────────────────────────────────────────

  describe("listInstalled()", () => {
    it("reads from local cache", async () => {
      const installed: MarketplacePluginManifest[] = [MANIFESTS[0]];
      vi.mocked(localCache.readInstalledManifests).mockReturnValue(installed);

      const result = await adapter.listInstalled();
      expect(result).toEqual(installed);
      expect(localCache.readInstalledManifests).toHaveBeenCalled();
    });
  });

  // ─── install ─────────────────────────────────────────────────────────

  describe("install()", () => {
    it("saves manifest locally", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      await adapter.install("plugin-a");
      expect(localCache.saveManifest).toHaveBeenCalledWith(MANIFESTS[0]);
    });

    it("throws for unknown plugin", async () => {
      mockFetch.mockResolvedValue(mockOk(MANIFESTS));
      await expect(adapter.install("unknown")).rejects.toThrow(
        'Plugin "unknown" not found in registry.',
      );
    });
  });

  // ─── uninstall ───────────────────────────────────────────────────────

  describe("uninstall()", () => {
    it("removes local plugin directory", async () => {
      await adapter.uninstall("plugin-a");
      expect(localCache.removePluginDir).toHaveBeenCalledWith("plugin-a");
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("handles network error (fetch fails)", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));
      await expect(adapter.search("test")).rejects.toThrow(
        "Failed to fetch plugin registry: Network failure",
      );
    });

    it("handles non-OK HTTP response", async () => {
      mockFetch.mockResolvedValue(mockError(404, "Not Found"));
      await expect(adapter.search("test")).rejects.toThrow(
        "Registry returned HTTP 404: Not Found",
      );
    });

    it("handles invalid JSON", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      } as Response);
      await expect(adapter.search("test")).rejects.toThrow(
        "Registry returned invalid JSON.",
      );
    });

    it("handles non-array registry JSON", async () => {
      mockFetch.mockResolvedValue(mockOk({ plugins: [] }));
      await expect(adapter.search("test")).rejects.toThrow(
        "Registry JSON is not an array.",
      );
    });
  });
});
