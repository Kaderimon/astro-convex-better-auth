/// <reference types="astro/client" />

interface InternalEnv {
  readonly PUBLIC_CONVEX_SITE_URL?: string
  readonly PUBLIC_CONVEX_URL?: string
  readonly SITE_URL?: string
  readonly BETTER_AUTH_SECRET?: string
}

declare namespace App {
  interface Locals {
    user: import("better-auth").User | null
    session: import("better-auth").Session | null
    convexToken?: string | null
  }
}

declare module "virtual:@convex-better-auth/astro/config" {
  import type { ConvexBetterAuthMiddlewareOptions } from "astro-convex-better-auth"
  export const middlewareOptions: ConvexBetterAuthMiddlewareOptions | null
  export function isStaticOutput(forceStatic?: boolean): boolean
}
