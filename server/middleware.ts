import type {
  ConvexBetterAuthMiddleware,
  ConvexBetterAuthMiddlewareOptions,
} from "../types"
import { authHandler, getConvexToken } from "./auth-server"

const CONVEX_SITE_URL = import.meta.env.PUBLIC_CONVEX_SITE_URL as string
const FORWARDED_COOKIE_NAMES = new Set([
  "better-auth.convex_jwt",
  "better-auth.session_token",
])

export function convexBetterAuthMiddleware(
  options: ConvexBetterAuthMiddlewareOptions = {},
): ConvexBetterAuthMiddleware {
  const { includeConvexToken = false } = options

  return async (context, next) => {
    const { pathname } = context.url

    if (pathname.startsWith("/api/auth")) {
      return authHandler(context.request)
    }

    const cookie = context.request.headers.get("cookie") ?? ""

    if (!cookie) {
      context.locals.user = null
      context.locals.session = null
      if (includeConvexToken) context.locals.convexToken = null
      return next()
    }

    console.log("Forwarding cookies")

    const appendedCookie = cookie
      .split("; ")
      .filter((c) => FORWARDED_COOKIE_NAMES.has(c.split("=")[0] ?? ""))
      .map((c) => `__Secure-${c}`)
      .join("; ")

    const res = await fetch(`${CONVEX_SITE_URL}/api/auth/get-session`, {
      headers: { "Better-Auth-Cookie": appendedCookie },
    })
    const data = res.ok ? await res.json() : null
    console.log("Auth session data:", data)
    context.locals.user = data?.user ?? null
    context.locals.session = data?.session ?? null

    if (includeConvexToken) {
      context.locals.convexToken = await getConvexToken(context.request.headers)
    }

    return next()
  }
}
