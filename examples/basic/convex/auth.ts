import { betterAuth } from "better-auth"
import { createClient } from "@convex-dev/better-auth"
import { convex, crossDomain } from "@convex-dev/better-auth/plugins"
import { anonymous } from "better-auth/plugins"
import { components } from "./_generated/api"
import authConfig from "./auth.config"
import type { GenericCtx } from "@convex-dev/better-auth"

export const authComponent = createClient(components.betterAuth)

// Factory: called per-request inside an httpAction so each request gets a
// fresh ctx reference for database access. Do NOT use as a module singleton.
export const createAuth = (ctx: GenericCtx) =>
  betterAuth({
    // CONVEX_SITE_URL is the Convex HTTP actions URL, set automatically at runtime.
    baseURL: process.env.CONVEX_SITE_URL,
    // SITE_URL must be set via: npx convex env set SITE_URL http://localhost:4321
    trustedOrigins: [process.env.SITE_URL ?? ""],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      convex({ authConfig }),
      crossDomain({ siteUrl: process.env.SITE_URL! }),
      anonymous(),
    ],
  })
