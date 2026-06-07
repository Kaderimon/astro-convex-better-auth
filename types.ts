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
   * When true, verifies the `better-auth.convex_jwt` cookie locally against the
   * Convex JWKS endpoint and skips the `get-session` network call on cache hits.
   * Falls back to `get-session` when the JWT is absent or fails verification.
   *
   * Note: `context.locals.user` will lack `id` and `image` on fast-path hits
   * unless you override `definePayload` in your Convex backend to include them.
   */
  jwtFastPath?: boolean
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
