import type { Session, User } from "better-auth"
import { parseSetCookieHeader } from "better-auth/cookies"
import type { APIContext } from "astro"
import type {
  ConvexBetterAuthMiddleware,
  ConvexBetterAuthMiddlewareOptions,
} from "../types"
import {
  ANON_IDENTITY_COOKIE,
  CONVEX_JWT_COOKIE,
  RESTORE_ANONYMOUS_SESSION_PATH,
  RESTORE_REJECTION_STATUSES,
  SECURE_COOKIE_PREFIX,
  SESSION_TOKEN_COOKIE,
} from "../shared/constants"
import { authHandler, getConvexToken } from "./auth-server"
import { getConvexSiteUrl } from "./env"

const FORWARDED_COOKIE_NAMES = new Set([
  CONVEX_JWT_COOKIE,
  SESSION_TOKEN_COOKIE,
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

type SessionData = { user?: User; session?: Session }

type FetchSessionResult = {
  data: SessionData | null
  /**
   * `Set-Better-Auth-Cookie` response header — the crossDomain server plugin
   * moves any `Set-Cookie` here when the request carries `Better-Auth-Cookie`.
   * Present when better-auth refreshed the session (updateAge elapsed).
   */
  setCookie: string | null
}

function fetchSession(
  siteUrl: string,
  betterAuthCookie: string,
): Promise<FetchSessionResult> {
  return fetch(`${siteUrl}/api/auth/get-session`, {
    headers: { "Better-Auth-Cookie": betterAuthCookie },
  })
    .then(async (res) => ({
      data: res.ok ? ((await res.json()) as SessionData) : null,
      setCookie: res.headers.get("set-better-auth-cookie"),
    }))
    .catch((err) => {
      console.warn(
        "[astro-convex-better-auth] get-session fetch failed:",
        err,
      )
      return { data: null, setCookie: null }
    })
}

/**
 * Writes the session cookies that better-auth refreshed during `get-session`
 * back to the browser. Without this the browser cookie keeps the Max-Age of
 * the original session and silently expires even though the server session
 * was extended past it.
 */
function applyRefreshedCookies(context: APIContext, setCookie: string): void {
  for (const [rawName, cookie] of parseSetCookieHeader(setCookie)) {
    const name = rawName.startsWith(SECURE_COOKIE_PREFIX)
      ? rawName.slice(SECURE_COOKIE_PREFIX.length)
      : rawName
    if (!FORWARDED_COOKIE_NAMES.has(name) || !cookie.value) continue
    const maxAge =
      cookie["max-age"] ??
      (cookie.expires
        ? Math.max(
            0,
            Math.floor((new Date(cookie.expires).getTime() - Date.now()) / 1000),
          )
        : undefined)
    context.cookies.set(name, cookie.value, {
      path: "/",
      sameSite: "lax",
      ...(maxAge !== undefined ? { maxAge: Number(maxAge) } : {}),
    })
  }
}

type RestoredSession = { user: User; session: Session; sessionToken: string }

/**
 * Calls the `restoreAnonymousSessionPlugin` endpoint to mint a fresh session for a
 * signed restore token. Clears the stale `anon_identity` cookie when the
 * backend rejects the token (invalid signature, user deleted, not anonymous);
 * keeps it on network errors so restoration can be retried.
 */
async function tryRestoreAnonymousSession(
  context: APIContext,
  siteUrl: string,
  rawRestoreToken: string,
): Promise<RestoredSession | null> {
  try {
    const res = await fetch(
      `${siteUrl}/api/auth${RESTORE_ANONYMOUS_SESSION_PATH}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: decodeURIComponent(rawRestoreToken) }),
      },
    )

    if (!res.ok) {
      // Drop the cookie only on a definitive rejection; transient failures
      // (5xx, 429) keep it so a later request can retry the restore.
      if (RESTORE_REJECTION_STATUSES.has(res.status)) {
        context.cookies.delete(ANON_IDENTITY_COOKIE, { path: "/" })
      }
      return null
    }

    const { sessionToken, user, session } = (await res.json()) as
      Partial<RestoredSession>
    if (!sessionToken || !user || !session) return null
    return { user, session, sessionToken }
  } catch (err) {
    console.warn(
      "[astro-convex-better-auth] restore-anonymous-session failed:",
      err,
    )
    return null
  }
}

export function convexBetterAuthMiddleware(
  options: ConvexBetterAuthMiddlewareOptions = {},
): ConvexBetterAuthMiddleware {
  const {
    includeConvexToken = false,
    restoreAnonymousSessions = false,
  } = options

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
          .map(([name, value]) => `${SECURE_COOKIE_PREFIX}${name}=${value}`)
          .join("; ")
      : ""

    context.locals.user = null
    context.locals.session = null
    if (includeConvexToken) context.locals.convexToken = null

    const anonRestoreToken = restoreAnonymousSessions
      ? cookieMap?.get(ANON_IDENTITY_COOKIE)
      : undefined

    if (!appendedCookie && !anonRestoreToken) {
      return next()
    }

    const siteUrl = getConvexSiteUrl()

    if (appendedCookie) {
      // Run get-session and (optionally) the token fetch in parallel.
      const [{ data, setCookie }, convexToken] = await Promise.all([
        fetchSession(siteUrl, appendedCookie),
        includeConvexToken
          ? safeGetConvexToken(context.request.headers)
          : Promise.resolve(null),
      ])

      context.locals.user = (data?.user as User) ?? null
      context.locals.session = (data?.session as Session) ?? null
      if (includeConvexToken) context.locals.convexToken = convexToken

      // Only propagate refreshed cookies for a live session; a null result's
      // cookie deletion is handled client-side by crossDomainClient.
      if (setCookie && data?.session) {
        applyRefreshedCookies(context, setCookie)
      }
    }

    // Anonymous session restoration: no valid session but a signed
    // `anon_identity` cookie is present — recreate the session for the stored
    // anonymous user without redirecting through the auth page.
    if (anonRestoreToken && !context.locals.session) {
      const restored = await tryRestoreAnonymousSession(
        context,
        siteUrl,
        anonRestoreToken,
      )
      if (restored) {
        context.locals.user = restored.user
        context.locals.session = restored.session
        const expiresAtMs = new Date(restored.session.expiresAt).getTime()
        context.cookies.set(SESSION_TOKEN_COOKIE, restored.sessionToken, {
          path: "/",
          sameSite: "lax",
          // Omit maxAge when expiresAt is missing/unparsable — a session
          // cookie beats one expiring immediately from maxAge: NaN.
          ...(Number.isFinite(expiresAtMs)
            ? { maxAge: Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000)) }
            : {}),
        })
        if (includeConvexToken) {
          const headers = new Headers(context.request.headers)
          headers.set(
            "cookie",
            `${SESSION_TOKEN_COOKIE}=${restored.sessionToken}`,
          )
          context.locals.convexToken = await safeGetConvexToken(headers)
        }
      }
    }

    return next()
  }
}
