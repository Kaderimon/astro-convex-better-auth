import { defineMiddleware } from "astro:middleware"
import { middlewareOptions } from "virtual:@convex-better-auth/astro/config"
import { convexBetterAuthMiddleware } from "./middleware"

export const onRequest = defineMiddleware(
  convexBetterAuthMiddleware(middlewareOptions ?? {}),
)
