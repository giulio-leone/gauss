// =============================================================================
// ClerkAuthAdapter — Clerk session-token verification + user lookup
// =============================================================================
//
// Usage:
//   import { ClerkAuthAdapter } from "./clerk-auth.adapter.js";
//
//   // Option A: pass config (Clerk client created lazily)
//   const auth = new ClerkAuthAdapter({
//     secretKey: "sk_live_...",
//     publishableKey: "pk_live_...",
//   });
//
//   // Option B: pass a pre-configured Clerk backend client
//   import { createClerkClient } from "@clerk/backend";
//   const auth = new ClerkAuthAdapter({
//     client: createClerkClient({ secretKey: "sk_live_..." }),
//   });
//
//   const result = await auth.authenticate(sessionToken);

import type { AuthPort, AuthResult, AuthUser } from "../../../ports/auth.port.js";

/** Options accepted by {@link ClerkAuthAdapter}. */
export interface ClerkAuthOptions {
  /** Pre-configured Clerk backend client instance. */
  client?: unknown;
  /** Clerk secret key — used when `client` is not provided. */
  secretKey?: string;
  /** Clerk publishable key. */
  publishableKey?: string;
  /** Optional authorized parties for JWT verification. */
  authorizedParties?: string[];
}

export class ClerkAuthAdapter implements AuthPort {
  private readonly options: ClerkAuthOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clerkClient: any;

  constructor(options: ClerkAuthOptions) {
    if (!options.client && !options.secretKey) {
      throw new Error(
        "ClerkAuthAdapter requires either a pre-configured client or a secretKey",
      );
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getClient(): Promise<any> {
    if (this.clerkClient) return this.clerkClient;
    if (this.options.client) {
      this.clerkClient = this.options.client;
      return this.clerkClient;
    }
    const clerk = await import("@clerk/backend");
    const createClerkClient =
      clerk.createClerkClient ?? (clerk as any).default?.createClerkClient;
    if (!createClerkClient) {
      throw new Error("Unable to resolve createClerkClient from @clerk/backend");
    }
    this.clerkClient = createClerkClient({
      secretKey: this.options.secretKey!,
      publishableKey: this.options.publishableKey,
    });
    return this.clerkClient;
  }

  // ---------------------------------------------------------------------------
  // AuthPort
  // ---------------------------------------------------------------------------

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const client = await this.getClient();

      // Verify the session JWT
      const { data: verifiedToken, errors } =
        await client.authenticateRequest(
          new Request("https://placeholder.local", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          {
            authorizedParties: this.options.authorizedParties,
          },
        );

      if (errors?.length || !verifiedToken?.userId) {
        // Fallback: try verifyToken directly (older SDK versions)
        return this.authenticateWithVerifyToken(client, token);
      }

      const user = await this.fetchUser(client, verifiedToken.userId);
      return { authenticated: true, user };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Fallback verification for SDK compatibility
  // ---------------------------------------------------------------------------

  private async authenticateWithVerifyToken(
    client: any,
    token: string,
  ): Promise<AuthResult> {
    try {
      const clerk = await import("@clerk/backend");
      const verifyToken =
        clerk.verifyToken ?? (clerk as any).default?.verifyToken;

      if (!verifyToken) {
        return { authenticated: false, error: "Unable to verify token" };
      }

      const payload = await verifyToken(token, {
        secretKey: this.options.secretKey,
        authorizedParties: this.options.authorizedParties,
      });

      if (!payload?.sub) {
        return { authenticated: false, error: "Token missing sub claim" };
      }

      const user = await this.fetchUser(client, payload.sub);
      return { authenticated: true, user };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : "Token verification failed",
      };
    }
  }

  // ---------------------------------------------------------------------------
  // User lookup
  // ---------------------------------------------------------------------------

  private async fetchUser(client: any, userId: string): Promise<AuthUser> {
    try {
      const clerkUser = await client.users.getUser(userId);
      const roles = this.extractRoles(clerkUser);

      return {
        id: userId,
        roles,
        metadata: {
          email: clerkUser.emailAddresses?.[0]?.emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName,
          imageUrl: clerkUser.imageUrl,
        },
      };
    } catch {
      // If user lookup fails, return minimal user from token
      return { id: userId, roles: [] };
    }
  }

  private extractRoles(clerkUser: any): string[] {
    // Clerk stores roles in publicMetadata or organizationMemberships
    const publicMeta = clerkUser.publicMetadata as Record<string, unknown> | undefined;
    if (publicMeta && Array.isArray(publicMeta.roles)) {
      return publicMeta.roles as string[];
    }
    // Extract from organization memberships if available
    if (Array.isArray(clerkUser.organizationMemberships)) {
      return clerkUser.organizationMemberships.map(
        (m: any) => m.role as string,
      );
    }
    return [];
  }
}
