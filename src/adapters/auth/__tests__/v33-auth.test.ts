// =============================================================================
// v33 Auth Adapter Tests — Supabase
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupabaseAuthAdapter } from "../supabase/supabase-auth.adapter.js";

// ---------------------------------------------------------------------------
// Supabase Auth
// ---------------------------------------------------------------------------

describe("SupabaseAuthAdapter", () => {
  const mockClient = {
    auth: {
      getUser: vi.fn(),
    },
  };

  let adapter: SupabaseAuthAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-123",
          email: "test@example.com",
          phone: null,
          app_metadata: { provider: "email", roles: ["admin"] },
        },
      },
      error: null,
    });
    adapter = new SupabaseAuthAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(SupabaseAuthAdapter);
  });

  it("throws without client or valid config", () => {
    expect(
      () => new SupabaseAuthAdapter({} as never),
    ).toThrow(
      "SupabaseAuthAdapter requires either a client or config with url and serviceRoleKey",
    );
  });

  it("authenticates valid token via supabase.auth.getUser", async () => {
    const result = await adapter.authenticate("valid-jwt-token");

    expect(mockClient.auth.getUser).toHaveBeenCalledWith("valid-jwt-token");
    expect(result.authenticated).toBe(true);
    expect(result.user?.id).toBe("user-123");
    expect(result.user?.roles).toEqual(["admin"]);
    expect(result.user?.metadata).toEqual(
      expect.objectContaining({ email: "test@example.com" }),
    );
  });

  it("returns unauthenticated on invalid token", async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });

    const result = await adapter.authenticate("bad-token");

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Invalid JWT");
  });

  it("handles Supabase SDK errors gracefully", async () => {
    mockClient.auth.getUser.mockRejectedValue(new Error("Network error"));

    const result = await adapter.authenticate("some-token");

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Network error");
  });
});
