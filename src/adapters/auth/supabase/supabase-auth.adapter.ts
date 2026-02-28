// =============================================================================
// SupabaseAuthAdapter — JWT verification via Supabase Auth
// =============================================================================

import type { AuthPort, AuthResult, AuthUser } from "../../../ports/auth.port.js";

export interface SupabaseAuthConfig {
  url: string;
  serviceRoleKey: string;
}

export class SupabaseAuthAdapter implements AuthPort {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<any>;

  constructor(options: { client?: unknown; config?: SupabaseAuthConfig }) {
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    } else if (options.config?.url && options.config.serviceRoleKey) {
      const cfg = options.config;
      this.clientPromise = import("@supabase/supabase-js").then(
        ({ createClient }) =>
          createClient(cfg.url, cfg.serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          }),
      );
    } else {
      throw new Error(
        "SupabaseAuthAdapter requires either a client or config with url and serviceRoleKey",
      );
    }
  }

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const client = await this.clientPromise;
      const {
        data: { user },
        error,
      } = await client.auth.getUser(token);

      if (error || !user) {
        return {
          authenticated: false,
          error: error?.message ?? "Invalid token",
        };
      }

      const authUser: AuthUser = {
        id: user.id,
        roles: this.extractRoles(user),
        metadata: {
          email: user.email,
          phone: user.phone,
          provider: user.app_metadata?.provider,
        },
      };

      return { authenticated: true, user: authUser };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractRoles(user: any): string[] {
    const appMeta = user.app_metadata;
    if (appMeta && Array.isArray(appMeta.roles)) {
      return appMeta.roles as string[];
    }
    if (appMeta?.role) {
      return [appMeta.role as string];
    }
    return [];
  }
}
