import type { Session, User } from "better-auth"
import type { APIContext } from "astro"

export type ConvexBetterAuthIntegrationOptions = {
  siteUrl?: string
  convexUrl?: string
  enableEnvSchema?: boolean
}

export type ConvexBetterAuthMiddlewareOptions = {
  includeConvexToken?: boolean
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
