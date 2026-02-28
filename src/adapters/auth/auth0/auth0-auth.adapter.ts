// =============================================================================
// Auth0AuthAdapter — Auth0 authentication via JWT verification + user info
// =============================================================================
//
// Usage:
//   import { Auth0AuthAdapter } from "./auth0-auth.adapter.js";
//
//   // Option A: pass config (ManagementClient created lazily)
//   const auth = new Auth0AuthAdapter({
//     domain: "my-tenant.auth0.com",
//     clientId: "abc",
//     clientSecret: "secret",
//   });
//
//   // Option B: pass a pre-configured Auth0 client
//   import { ManagementClient } from "auth0";
//   const auth = new Auth0AuthAdapter({
//     domain: "my-tenant.auth0.com",
//     client: new ManagementClient({ domain: "...", clientId: "...", clientSecret: "..." }),
//   });
//
//   const result = await auth.authenticate(bearerToken);

import type { AuthPort, AuthResult, AuthUser } from "../../../ports/auth.port.js";

/** Options accepted by {@link Auth0AuthAdapter}. */
export interface Auth0AuthOptions {
  /** Auth0 tenant domain (e.g. `my-tenant.auth0.com`). */
  domain: string;
  /** Pre-configured Auth0 ManagementClient instance. */
  client?: unknown;
  /** Auth0 application client ID — used when `client` is not provided. */
  clientId?: string;
  /** Auth0 application client secret — used when `client` is not provided. */
  clientSecret?: string;
  /** Expected JWT audience (defaults to `https://{domain}/api/v2/`). */
  audience?: string;
}

export class Auth0AuthAdapter implements AuthPort {
  private readonly options: Auth0AuthOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private managementClient: any;
  private jwksUri: string;

  constructor(options: Auth0AuthOptions) {
    if (!options.client && (!options.clientId || !options.clientSecret)) {
      throw new Error(
        "Auth0AuthAdapter requires either a pre-configured client or clientId + clientSecret",
      );
    }
    this.options = options;
    this.jwksUri = `https://${options.domain}/.well-known/jwks.json`;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getManagementClient(): Promise<any> {
    if (this.managementClient) return this.managementClient;
    if (this.options.client) {
      this.managementClient = this.options.client;
      return this.managementClient;
    }
    const auth0 = await import("auth0");
    const ManagementClient =
      auth0.ManagementClient ?? (auth0 as any).default?.ManagementClient;
    if (!ManagementClient) {
      throw new Error("Unable to resolve ManagementClient from auth0");
    }
    this.managementClient = new ManagementClient({
      domain: this.options.domain,
      clientId: this.options.clientId!,
      clientSecret: this.options.clientSecret!,
    });
    return this.managementClient;
  }

  // ---------------------------------------------------------------------------
  // AuthPort
  // ---------------------------------------------------------------------------

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const payload = await this.verifyToken(token);
      const userId = payload.sub as string;
      if (!userId) {
        return { authenticated: false, error: "Token missing sub claim" };
      }

      const user: AuthUser = {
        id: userId,
        roles: this.extractRoles(payload),
        metadata: payload as Record<string, unknown>,
      };

      return { authenticated: true, user };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      };
    }
  }

  // ---------------------------------------------------------------------------
  // JWT verification using JWKS
  // ---------------------------------------------------------------------------

  private async verifyToken(token: string): Promise<Record<string, unknown>> {
    const auth0 = await import("auth0");

    // auth0 v4+ exposes jwtVerifier helpers; fall back to manual JWKS
    if (typeof (auth0 as any).jwtVerifier === "function") {
      const verifier = (auth0 as any).jwtVerifier({
        issuerBaseURL: `https://${this.options.domain}/`,
        audience:
          this.options.audience ??
          `https://${this.options.domain}/api/v2/`,
      });
      const { payload } = await verifier.verify(token);
      return payload;
    }

    // Fallback: decode + fetch JWKS + verify with node:crypto
    return this.verifyWithJwks(token);
  }

  private async verifyWithJwks(token: string): Promise<Record<string, unknown>> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed JWT");

    const [headerB64, payloadB64] = parts;
    const header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf-8"),
    );
    const kid = header.kid as string | undefined;
    if (!kid) throw new Error("JWT header missing kid");

    // Fetch JWKS
    const jwksResponse = await fetch(this.jwksUri);
    if (!jwksResponse.ok) throw new Error("Failed to fetch JWKS");
    const jwks = (await jwksResponse.json()) as {
      keys: Array<{ kid: string; x5c?: string[]; n?: string; e?: string }>;
    };

    const key = jwks.keys.find((k) => k.kid === kid);
    if (!key) throw new Error(`No matching key found for kid: ${kid}`);

    // Build public key
    const { createPublicKey, createVerify } = await import("node:crypto");
    let publicKey: ReturnType<typeof createPublicKey>;

    if (key.x5c?.[0]) {
      const certPem = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;
      publicKey = createPublicKey(certPem);
    } else if (key.n && key.e) {
      publicKey = createPublicKey({
        key: { kty: "RSA", n: key.n, e: key.e },
        format: "jwk",
      });
    } else {
      throw new Error("JWKS key missing x5c or RSA components");
    }

    // Verify signature
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureBuffer = Buffer.from(parts[2], "base64url");
    if (!verifier.verify(publicKey, signatureBuffer)) {
      throw new Error("Invalid JWT signature");
    }

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    );

    // Basic claim validation
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && now > payload.exp) {
      throw new Error("Token expired");
    }

    return payload;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractRoles(payload: Record<string, unknown>): string[] {
    // Auth0 custom claims often use namespaced keys
    for (const key of Object.keys(payload)) {
      if (key.endsWith("/roles") || key === "roles") {
        const val = payload[key];
        if (Array.isArray(val)) return val as string[];
      }
    }
    return [];
  }
}
