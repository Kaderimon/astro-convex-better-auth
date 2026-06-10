import type { BetterAuthClientPlugin } from "better-auth/client"
import {
  RESTORE_ANONYMOUS_SESSION_PATH,
  RESTORE_REJECTION_STATUSES,
  SECURE_COOKIE_PREFIX,
  SESSION_TOKEN_COOKIE,
} from "../shared/constants"
import {
  adoptRestoredSessionCookie,
  buildBetterAuthCookieHeader,
  clearAnonIdentityCookie,
  clearSessionCookiesFromDocument,
  getAnonIdentityCookie,
  readDocumentCookie,
  setAnonIdentityCookie,
  syncCookiesToDocument,
} from "./cookies"

type AuthFetch = (
  path: string,
  options: { method: string; body: Record<string, string> },
) => Promise<{ error: { status: number } | null }>

// Minimum gap between client-side restore attempts, so a backend that keeps
// rejecting fresh sessions cannot turn the retry into a tight loop.
const RESTORE_RETRY_MS = 5_000

const SENT_TOKEN_PREFIX = `${SECURE_COOKIE_PREFIX}${SESSION_TOKEN_COOKIE}=`

/**
 * Extracts the session token a request actually sent in its
 * `Better-Auth-Cookie` header. Used to tell whether a null get-session
 * response is about the token we currently hold or about an older one
 * (a stale in-flight request that raced a restore).
 */
function sentSessionToken(request: { headers?: unknown }): string | null {
  const headers = request.headers
  let cookieHeader: string | null = null
  if (headers instanceof Headers) {
    cookieHeader = headers.get("Better-Auth-Cookie")
  } else if (headers && typeof headers === "object") {
    const record = headers as Record<string, string>
    const key = Object.keys(record).find(
      (k) => k.toLowerCase() === "better-auth-cookie",
    )
    cookieHeader = key ? record[key] : null
  }
  return (
    cookieHeader
      ?.split("; ")
      .find((c) => c.startsWith(SENT_TOKEN_PREFIX))
      ?.slice(SENT_TOKEN_PREFIX.length) ?? null
  )
}

export type AstroConvexClientOptions = {
  /**
   * Enables client-side support for anonymous session restoration, symmetric
   * with the middleware option of the same name:
   *
   * - stores the signed `restoreToken` from `/sign-in/anonymous` responses in
   *   the `anon_identity` cookie (and clears it on sign-out),
   * - adopts a session cookie set by the middleware's server-side restore back
   *   into the crossDomainClient localStorage store, so `useSession()` sees
   *   the restored session,
   * - when a session expires while the page is open (`get-session` returns
   *   null), calls the restore endpoint directly so `useSession()` recovers
   *   in place without a reload.
   *
   * The pre-configured `authClient` enables this; it stays inert unless
   * `restoreAnonymousPlugin()` is registered on the Convex backend and
   * `restoreAnonymousSessions: true` is set in the middleware.
   *
   * @default false
   */
  restoreAnonymousSessions?: boolean
}

/**
 * Client plugin that keeps the browser cookie jar and the crossDomainClient
 * localStorage store in sync.
 *
 * **Plugin order matters**: register this plugin *after* `crossDomainClient()`
 * (the pre-configured `authClient` already does). better-fetch runs plugin
 * `init`/`onSuccess` hooks in array order — this plugin's `init` must run
 * after `crossDomainClient` builds the `Better-Auth-Cookie` header so it can
 * override it with an adopted token, and its `onSuccess` must run after
 * `crossDomainClient` writes localStorage so `syncCookiesToDocument()` sees
 * fresh values.
 */
export function astroConvexClient(
  options: AstroConvexClientOptions = {},
): BetterAuthClientPlugin {
  const { restoreAnonymousSessions = false } = options

  // Captured in getActions. Restoring through the auth client's own fetch
  // pipeline means crossDomainClient attaches the Better-Auth-Cookie header,
  // stores the session cookie from the response, and notifies $sessionSignal
  // so useSession() refetches — no manual store writes needed.
  let authFetch: AuthFetch | null = null
  let restoreInFlight = false
  let lastRestoreAttempt = 0

  const restoreAnonymousSession = async () => {
    if (!authFetch || restoreInFlight) return
    if (Date.now() - lastRestoreAttempt < RESTORE_RETRY_MS) return
    const token = getAnonIdentityCookie()
    if (!token) return
    restoreInFlight = true
    lastRestoreAttempt = Date.now()
    try {
      const { error } = await authFetch(RESTORE_ANONYMOUS_SESSION_PATH, {
        method: "POST",
        body: { token },
      })
      // Clear only on definitive rejection (invalid signature, user deleted,
      // not anonymous). Transient failures — 5xx, 429, network errors in the
      // catch below — keep the cookie so the restore can be retried.
      if (error && RESTORE_REJECTION_STATUSES.has(error.status)) {
        clearAnonIdentityCookie()
      }
    } catch {
      // Network error — keep the cookie for a later attempt.
    } finally {
      restoreInFlight = false
    }
  }

  return {
    id: "astro-convex",
    getActions: ($fetch) => {
      authFetch = $fetch as unknown as AuthFetch
      return {}
    },
    fetchPlugins: [
      {
        id: "astro-convex-cookie-sync",
        name: "Astro Convex cookie sync",
        hooks: {
          onSuccess({ data, request }) {
            if (typeof document === "undefined") return
            const url = request.url.toString()
            syncCookiesToDocument()
            if (!restoreAnonymousSessions) return
            const restoreToken = (data as { restoreToken?: string } | null)?.restoreToken
            if (url.includes("/sign-in/anonymous") && restoreToken) {
              setAnonIdentityCookie(restoreToken)
            }
            if (url.includes("/sign-out")) {
              clearAnonIdentityCookie()
              clearSessionCookiesFromDocument()
            }
            // A null get-session means the session token this request carried
            // is dead. Clear it from the jar, or the init hook would re-adopt
            // the rejected token on every $sessionSignal refetch: the server
            // answers each one with a cookie-clearing Set-Better-Auth-Cookie,
            // crossDomainClient notifies the signal again, and get-session loops
            // forever. Then restore the anonymous session in place (rate-limited)
            // so useSession() recovers without a page reload.
            //
            // Only act when the verdict is about the token we currently hold:
            // a null response whose request carried a different (older) token
            // is a stale in-flight request that raced a restore — acting on it
            // would clear the freshly restored cookie.
            if (url.includes("/get-session") && data == null) {
              const currentToken = readDocumentCookie(SESSION_TOKEN_COOKIE)
              if (currentToken && sentSessionToken(request) !== currentToken) {
                return
              }
              clearSessionCookiesFromDocument()
              void restoreAnonymousSession()
            }
          },
        },
        async init(url, options) {
          if (
            !restoreAnonymousSessions ||
            typeof document === "undefined" ||
            url.includes("/sign-out")
          ) {
            return { url, options }
          }
          // A session restored server-side exists only in document.cookie;
          // adopt it into the localStorage store and rebuild the header that
          // crossDomainClient already derived from the stale store.
          const adopted = adoptRestoredSessionCookie()
          if (adopted) {
            options = options ?? {}
            options.headers = {
              ...options.headers,
              "Better-Auth-Cookie": buildBetterAuthCookieHeader(adopted),
            }
          }
          return { url, options }
        },
      },
    ],
  }
}
