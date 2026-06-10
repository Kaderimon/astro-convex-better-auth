import type { Session, User } from "better-auth"
import type { APIContext } from "astro"

export type ConvexBetterAuthIntegrationOptions = {
  siteUrl?: string
  convexUrl?: string
  enableEnvSchema?: boolean
  /**
   * Automatically injects `convexBetterAuthMiddleware` so you don't need to
   * create `src/middleware.ts` yourself.
   *
   * - `true` — inject with default options
   * - `ConvexBetterAuthMiddlewareOptions` — inject with custom options
   * - `false` / omitted — no injection (manual setup, existing behaviour)
   *
   * When enabled, write your own route-protection logic in `src/middleware.ts`
   * using `context.locals.user` / `context.locals.session` directly — do NOT
   * also call `convexBetterAuthMiddleware()` there or it will run twice.
   */
  autoMiddleware?: boolean | ConvexBetterAuthMiddlewareOptions
}

export type ConvexBetterAuthMiddlewareOptions = {
  includeConvexToken?: boolean
  /**
   * When true, checks for a signed `anon_identity` browser cookie whenever no
   * session is found. If present, calls `POST /api/auth/restore-anonymous-session`
   * on the Convex backend, which verifies the token's HMAC signature and creates
   * a new session for the stored anonymous user, then populates `context.locals`
   * for the current request without a redirect.
   *
   * Requires `restoreAnonymousSessionPlugin()` (from `astro-convex-better-auth/plugins`)
   * to be registered in your Convex auth config. An auth client with
   * `restoreAnonymousSessionClient()` registered sets the cookie automatically
   * after anonymous sign-in.
   */
  restoreAnonymousSessions?: boolean
}

export type ConvexBetterAuthLocals = {
  user: User | null
  session: Session | null
  convexToken?: string | null
}

export type ConvexBetterAuthNext = () => Promise<Response>

export type ConvexBetterAuthMiddleware = (
  context: APIContext,
  next: ConvexBetterAuthNext,
) => Promise<Response>
