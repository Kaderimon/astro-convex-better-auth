import type { Session, User } from "better-auth"
import type {
  ConvexBetterAuthMiddleware,
  ConvexBetterAuthMiddlewareOptions,
} from "../types"
import { authHandler, getConvexToken } from "./auth-server"
import { getConvexSiteUrl } from "./env"
import { verifyConvexJwt } from "./jwks"

const FORWARDED_COOKIE_NAMES = new Set([
  "better-auth.convex_jwt",
  "better-auth.session_token",
])

// RFC 7519 §4.1 registered claim names — excluded from the user fields spread
const JWT_STANDARD_CLAIMS = new Set([
  "iss",
  "sub",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
])

function parseCookies(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of cookieHeader.split("; ")) {
    const eqIdx = part.indexOf("=")
    if (eqIdx !== -1) {
      map.set(part.slice(0, eqIdx), part.slice(eqIdx + 1))
    }
  }
  return map
}

async function safeGetConvexToken(headers: Headers): Promise<string | null> {
  try {
    return await getConvexToken(headers)
  } catch (err) {
    console.warn("[astro-convex-better-auth] convex token fetch failed:", err)
    return null
  }
}

export function convexBetterAuthMiddleware(
  options: ConvexBetterAuthMiddlewareOptions = {},
): ConvexBetterAuthMiddleware {
  const { includeConvexToken = false, jwtFastPath = false } = options

  return async (context, next) => {
    const { pathname } = context.url

    if (pathname.startsWith("/api/auth")) {
      return authHandler(context.request)
    }

    const cookie = context.request.headers.get("cookie") ?? ""

    const cookieMap = cookie ? parseCookies(cookie) : null

    const appendedCookie = cookieMap
      ? Array.from(cookieMap.entries())
          .filter(([name]) => FORWARDED_COOKIE_NAMES.has(name))
          .map(([name, value]) => `__Secure-${name}=${value}`)
          .join("; ")
      : ""

    if (!appendedCookie) {
      context.locals.user = null
      context.locals.session = null
      if (includeConvexToken) context.locals.convexToken = null
      return next()
    }

    const siteUrl = getConvexSiteUrl()

    // JWT fast-path: verify convex_jwt locally to skip the get-session round-trip.
    // Falls back to get-session if the JWT is absent or fails verification.
    // Note: context.locals.user will not contain id or image on fast-path hits unless
    // definePayload is overridden in the Convex backend to include them.
    if (jwtFastPath) {
      const jwtToken = cookieMap!.get("better-auth.convex_jwt")
      if (jwtToken) {
        const payload = await verifyConvexJwt(jwtToken, siteUrl)
        if (payload) {
          const { sessionId, ...rest } = payload
          const userFields = Object.fromEntries(
            Object.entries(rest).filter(([k]) => !JWT_STANDARD_CLAIMS.has(k)),
          )
          context.locals.user = userFields as unknown as User
          context.locals.session = sessionId
            ? ({ id: sessionId } as unknown as Session)
            : null
          if (includeConvexToken) {
            context.locals.convexToken = await safeGetConvexToken(
              context.request.headers,
            )
          }
          return next()
        }
      }
    }

    // Run get-session and (optionally) the token fetch in parallel.
    const [data, convexToken] = await Promise.all([
      fetch(`${siteUrl}/api/auth/get-session`, {
        headers: { "Better-Auth-Cookie": appendedCookie },
      })
        .then((res) =>
          res.ok
            ? (res.json() as Promise<{ user?: User; session?: Session }>)
            : null,
        )
        .catch((err) => {
          console.warn(
            "[astro-convex-better-auth] get-session fetch failed:",
            err,
          )
          return null
        }),
      includeConvexToken
        ? safeGetConvexToken(context.request.headers)
        : Promise.resolve(null),
    ])

    context.locals.user = (data?.user as User) ?? null
    context.locals.session = (data?.session as Session) ?? null
    if (includeConvexToken) context.locals.convexToken = convexToken

    return next()
  }
}
