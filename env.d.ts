/// <reference types="astro/client" />

interface InternalEnv {
  readonly PUBLIC_CONVEX_SITE_URL?: string
  readonly PUBLIC_CONVEX_URL?: string
  readonly SITE_URL?: string
  readonly BETTER_AUTH_SECRET?: string
}

declare module "virtual:@convex-better-auth/astro/config" {
  export function isStaticOutput(forceStatic?: boolean): boolean
}
