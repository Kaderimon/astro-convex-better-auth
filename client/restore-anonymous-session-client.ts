import type { BetterAuthClientPlugin } from "better-auth/client"
import {
  RESTORE_ANONYMOUS_SESSION_PATH,
  RESTORE_REJECTION_STATUSES,
  SECURE_COOKIE_PREFIX,
  SESSION_TOKEN_COOKIE,
} from "../shared/constants"
import {
  clearAnonIdentityCookie,
  getAnonIdentityCookie,
  readDocumentCookie,
  setAnonIdentityCookie,
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

/**
 * Client plugin for anonymous session restoration, the client-side counterpart
 * of `restoreAnonymousSessionPlugin` (Convex backend) and
 * `convexBetterAuthMiddleware({ restoreAnonymousSessions: true })` (Astro):
 *
 * - stores the signed `restoreToken` from `/sign-in/anonymous` responses in
 *   the `anon_identity` cookie (and clears it on sign-out),
 * - when a session expires (`get-session` returns null), calls the restore
 *   endpoint so `useSession()` recovers in place without a reload.
 *
 * Registering the plugin is the opt-in; it stays inert unless
 * `restoreAnonymousSessionPlugin()` is registered on the Convex backend
 * (without it, no `restoreToken` ever arrives).
 *
 * Register it *after* `crossDomainClient()`: better-fetch runs plugin hooks in
 * array order, and this plugin's `onSuccess` inspects the cookie jar expecting
 * `crossDomainClient` to have already applied the response's cookie changes
 * through `cookieJarStorage`.
 *
 * Restoring goes through the auth client's own fetch pipeline, so
 * `crossDomainClient` attaches the `Better-Auth-Cookie` header, persists the
 * fresh session cookie from the response, and notifies `$sessionSignal` so
 * `useSession()` refetches — no manual store writes needed.
 */
export function restoreAnonymousSessionClient(): BetterAuthClientPlugin {
  // Captured in getActions.
  let authFetch: AuthFetch | null = null
  let restoreInFlight = false
  let lastRestoreAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const restoreAnonymousSession = async () => {
    if (!authFetch || restoreInFlight) return
    // A live session means there is nothing to restore — e.g. a scheduled
    // retry firing after a concurrent restore already succeeded or the user
    // signed back in.
    if (readDocumentCookie(SESSION_TOKEN_COOKIE)) return
    const token = getAnonIdentityCookie()
    if (!token) return
    const waitMs = RESTORE_RETRY_MS - (Date.now() - lastRestoreAttempt)
    if (waitMs > 0) {
      // Rate-limited. Schedule a single retry at the window's end: with the
      // cookie jar as the only session store, a stale null get-session that
      // raced a successful restore wipes the fresh token, and nothing else
      // would trigger another get-session to re-enter this path.
      retryTimer ??= setTimeout(() => {
        retryTimer = null
        void restoreAnonymousSession()
      }, waitMs)
      return
    }
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
    id: "restore-anonymous-session",
    getActions: ($fetch) => {
      authFetch = $fetch as unknown as AuthFetch
      return {}
    },
    fetchPlugins: [
      {
        id: "restore-anonymous-session-fetch",
        name: "Anonymous session restore",
        hooks: {
          onSuccess({ data, request }) {
            if (typeof document === "undefined") {
              return
            }
            const url = request.url.toString()
            const restoreToken = (data as { restoreToken?: string } | null)
              ?.restoreToken
            if (url.includes("/sign-in/anonymous") && restoreToken) {
              setAnonIdentityCookie(restoreToken)
            }
            if (url.includes("/sign-out")) {
              clearAnonIdentityCookie()
              if (retryTimer) {
                clearTimeout(retryTimer)
                retryTimer = null
              }
            }
            // A null get-session means the session token the request carried
            // is dead; crossDomainClient has already dropped it from the jar
            // via cookieJarStorage. Restore the anonymous session in place
            // (rate-limited) so useSession() recovers without a page reload.
            //
            // Only act when the verdict is about the token we currently hold:
            // a null response whose request carried a different (older) token
            // is a stale in-flight request that raced a restore — the fresh
            // session is fine.
            if (url.includes("/get-session") && data == null) {
              const currentToken = readDocumentCookie(SESSION_TOKEN_COOKIE)
              if (currentToken && sentSessionToken(request) !== currentToken) {
                return
              }
              void restoreAnonymousSession()
            }
          },
        },
      },
    ],
  }
}
