// =============================================================================
// FirebaseAuthAdapter — Firebase Admin Auth ID-token verification
// =============================================================================
//
// Usage:
//   import { FirebaseAuthAdapter } from "./firebase-auth.adapter.js";
//
//   // Option A: pass config (Firebase Admin app created lazily)
//   const auth = new FirebaseAuthAdapter({
//     projectId: "my-project",
//     serviceAccount: "/path/to/service-account.json",
//   });
//
//   // Option B: pass a pre-configured Firebase Admin app
//   import { initializeApp, cert } from "firebase-admin/app";
//   const app = initializeApp({ credential: cert("./sa.json") });
//   const auth = new FirebaseAuthAdapter({ app });
//
//   const result = await auth.authenticate(idToken);

import type { AuthPort, AuthResult, AuthUser } from "../../../ports/auth.port.js";

/** Options accepted by {@link FirebaseAuthAdapter}. */
export interface FirebaseAuthOptions {
  /** Pre-configured Firebase Admin App instance. */
  app?: unknown;
  /** Google Cloud project ID — used when `app` is not provided. */
  projectId?: string;
  /** Path to a service-account JSON key file, or the parsed object. */
  serviceAccount?: string | Record<string, unknown>;
  /** If true, skip token revocation checks (faster but less secure). */
  skipRevocationCheck?: boolean;
}

export class FirebaseAuthAdapter implements AuthPort {
  private readonly options: FirebaseAuthOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private firebaseApp: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private firebaseAuth: any;

  constructor(options: FirebaseAuthOptions) {
    if (!options.app && !options.projectId) {
      throw new Error(
        "FirebaseAuthAdapter requires either a pre-configured app or a projectId",
      );
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getAuth(): Promise<any> {
    if (this.firebaseAuth) return this.firebaseAuth;

    const adminApp = await import("firebase-admin/app");
    const adminAuth = await import("firebase-admin/auth");

    if (this.options.app) {
      this.firebaseApp = this.options.app;
    } else {
      const initializeApp =
        adminApp.initializeApp ?? (adminApp as any).default?.initializeApp;
      const cert = adminApp.cert ?? (adminApp as any).default?.cert;

      if (!initializeApp) {
        throw new Error("Unable to resolve initializeApp from firebase-admin/app");
      }

      const credential = this.options.serviceAccount && cert
        ? cert(this.options.serviceAccount)
        : undefined;

      // Use a unique app name to avoid conflicts with other Firebase instances
      const appName = `gauss-flow-auth-${this.options.projectId}`;
      try {
        this.firebaseApp = adminApp.getApp(appName);
      } catch {
        this.firebaseApp = initializeApp(
          {
            projectId: this.options.projectId,
            ...(credential ? { credential } : {}),
          },
          appName,
        );
      }
    }

    const getAuth =
      adminAuth.getAuth ?? (adminAuth as any).default?.getAuth;
    if (!getAuth) {
      throw new Error("Unable to resolve getAuth from firebase-admin/auth");
    }
    this.firebaseAuth = getAuth(this.firebaseApp);
    return this.firebaseAuth;
  }

  // ---------------------------------------------------------------------------
  // AuthPort
  // ---------------------------------------------------------------------------

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const auth = await this.getAuth();
      const checkRevoked = !this.options.skipRevocationCheck;

      const decodedToken = await auth.verifyIdToken(token, checkRevoked);
      const uid = decodedToken.uid as string;

      const user = await this.fetchUser(auth, uid, decodedToken);
      return { authenticated: true, user };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      };
    }
  }

  // ---------------------------------------------------------------------------
  // User lookup
  // ---------------------------------------------------------------------------

  private async fetchUser(
    auth: any,
    uid: string,
    decodedToken: Record<string, unknown>,
  ): Promise<AuthUser> {
    const roles = this.extractRoles(decodedToken);

    try {
      const userRecord = await auth.getUser(uid);
      return {
        id: uid,
        roles,
        metadata: {
          email: userRecord.email,
          displayName: userRecord.displayName,
          photoURL: userRecord.photoURL,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          customClaims: userRecord.customClaims,
        },
      };
    } catch {
      // If user lookup fails, return minimal user from token
      return {
        id: uid,
        roles,
        metadata: decodedToken as Record<string, unknown>,
      };
    }
  }

  private extractRoles(claims: Record<string, unknown>): string[] {
    // Firebase custom claims commonly use "roles" or "role"
    if (Array.isArray(claims.roles)) return claims.roles as string[];
    if (typeof claims.role === "string") return [claims.role];

    // Check nested custom claims
    const customClaims = claims.firebase as Record<string, unknown> | undefined;
    if (customClaims && Array.isArray(customClaims.roles)) {
      return customClaims.roles as string[];
    }
    return [];
  }
}
