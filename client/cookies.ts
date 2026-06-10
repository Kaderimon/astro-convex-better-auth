import {
  ANON_IDENTITY_COOKIE,
  CONVEX_JWT_COOKIE,
  COOKIE_STORAGE_KEY,
  SECURE_COOKIE_PREFIX,
  SESSION_TOKEN_COOKIE,
} from "../shared/constants"

/**
 * Reads a single cookie value from `document.cookie`, or null when absent.
 */
export function readDocumentCookie(name: string): string | null {
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? null
  )
}

/**
 * Persists the signed anonymous restore token (the `restoreToken` field that
 * `restoreAnonymousPlugin` adds to the `/sign-in/anonymous` response) as a
 * long-lived browser cookie so that
 * `convexBetterAuthMiddleware({ restoreAnonymousSessions: true })` can
 * transparently restore the session after it expires.
 *
 * The pre-configured `authClient` calls this automatically after anonymous
 * sign-in; only call it yourself if you build a custom auth client.
 */
export function setAnonIdentityCookie(restoreToken: string): void {
  document.cookie = `${ANON_IDENTITY_COOKIE}=${encodeURIComponent(restoreToken)}; Path=/; SameSite=Lax; Max-Age=31536000`
}

/**
 * Removes the anonymous identity cookie — call on explicit sign-out so the
 * next visitor starts fresh rather than resuming the previous anonymous session.
 */
export function clearAnonIdentityCookie(): void {
  document.cookie = `${ANON_IDENTITY_COOKIE}=; Path=/; Max-Age=0`
}

/**
 * Reads the signed anonymous restore token from `document.cookie`, or null
 * when absent (never set, cleared on sign-out, or rejected by the backend).
 */
export function getAnonIdentityCookie(): string | null {
  const raw = readDocumentCookie(ANON_IDENTITY_COOKIE)
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

export interface StoredCookie {
  value: string
  expires: string | null
}

const STORED_SESSION_TOKEN_KEY = `${SECURE_COOKIE_PREFIX}${SESSION_TOKEN_COOKIE}`

function isUnexpired(v: StoredCookie): boolean {
  return !v.expires || new Date(v.expires) >= new Date()
}

function parseCookieJson(raw: string): Record<string, StoredCookie> {
  try {
    return JSON.parse(raw) as Record<string, StoredCookie>
  } catch {
    return {}
  }
}

export function getCookies(raw: string): string[] {
  return Object.entries(parseCookieJson(raw))
    .filter(([, v]) => isUnexpired(v))
    .map(([k, v]) => `${k.replace(SECURE_COOKIE_PREFIX, "")}=${v.value}`)
}

export function syncCookiesToDocument() {
  getCookies(localStorage.getItem(COOKIE_STORAGE_KEY) ?? "").forEach((c) => {
    document.cookie = `${c}; Path=/; SameSite=Lax; Max-Age=2592000`
  })
}

function parseStoredCookies(): Record<string, StoredCookie> {
  return parseCookieJson(localStorage.getItem(COOKIE_STORAGE_KEY) ?? "{}")
}

/**
 * Reverse sync (document.cookie → localStorage): adopts a session token that
 * exists in the browser cookie jar but not in the crossDomainClient store.
 * This happens when `convexBetterAuthMiddleware({ restoreAnonymousSessions: true })`
 * restores a session server-side — the middleware can only set a cookie, while
 * client-side auth requests read from localStorage.
 *
 * Returns the updated store when an adoption happened (pass it to
 * `buildBetterAuthCookieHeader` to avoid re-parsing), or null when the store
 * already agreed with the cookie jar.
 */
export function adoptRestoredSessionCookie(): Record<string, StoredCookie> | null {
  const cookieValue = readDocumentCookie(SESSION_TOKEN_COOKIE)
  if (!cookieValue) return null

  const stored = parseStoredCookies()
  const existing = stored[STORED_SESSION_TOKEN_KEY]
  if (existing && isUnexpired(existing) && existing.value === cookieValue) {
    return null
  }

  stored[STORED_SESSION_TOKEN_KEY] = { value: cookieValue, expires: null }
  localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(stored))
  return stored
}

/**
 * Builds the `Better-Auth-Cookie` header value from the crossDomainClient
 * localStorage store (or a pre-parsed copy of it), keeping the `__Secure-`
 * prefixes the Convex backend expects. Mirrors crossDomainClient's own header
 * construction so the header can be rebuilt after `adoptRestoredSessionCookie()`
 * updates the store.
 */
export function buildBetterAuthCookieHeader(
  store: Record<string, StoredCookie> = parseStoredCookies(),
): string {
  return Object.entries(store)
    .filter(([, v]) => isUnexpired(v))
    .map(([k, v]) => `${k}=${v.value}`)
    .join("; ")
}

/**
 * Expires the better-auth session cookies in document.cookie — call on
 * sign-out so a revoked token is not re-adopted into the client store by
 * `adoptRestoredSessionCookie()` on subsequent requests.
 */
export function clearSessionCookiesFromDocument(): void {
  document.cookie = `${SESSION_TOKEN_COOKIE}=; Path=/; Max-Age=0`
  document.cookie = `${CONVEX_JWT_COOKIE}=; Path=/; Max-Age=0`
}
