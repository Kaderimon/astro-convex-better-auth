import {
  ANON_IDENTITY_COOKIE,
  BETTER_AUTH_COOKIE_PREFIX,
  COOKIE_STORAGE_KEY,
  SECURE_COOKIE_PREFIX,
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
 * `restoreAnonymousSessionPlugin` adds to the `/sign-in/anonymous` response)
 * as a long-lived browser cookie so that
 * `convexBetterAuthMiddleware({ restoreAnonymousSessions: true })` can
 * transparently restore the session after it expires.
 *
 * `restoreAnonymousSessionClient()` calls this automatically after anonymous
 * sign-in; only call it yourself if you handle the sign-in response manually.
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

// Fallback lifetime (30 days) for store entries whose expiry metadata is
// unknown — entries reconstructed from document.cookie always lack it, since
// a cookie's remaining lifetime cannot be read back from the jar.
const DEFAULT_COOKIE_MAX_AGE = 2_592_000

function parseCookieJson(raw: string): Record<string, StoredCookie> {
  try {
    return JSON.parse(raw) as Record<string, StoredCookie>
  } catch {
    return {}
  }
}

function documentCookieEntries(): Array<[name: string, value: string]> {
  const entries: Array<[string, string]> = []
  for (const part of document.cookie.split("; ")) {
    const eqIdx = part.indexOf("=")
    if (eqIdx !== -1) {
      entries.push([part.slice(0, eqIdx), part.slice(eqIdx + 1)])
    }
  }
  return entries
}

/**
 * Storage adapter for `crossDomainClient()` that backs its cookie store with
 * `document.cookie` instead of localStorage, so the browser cookie jar is the
 * single source of truth shared by client-side auth requests and the Astro
 * SSR middleware. A session cookie set server-side (e.g. by
 * `convexBetterAuthMiddleware({ restoreAnonymousSessions: true })`) is
 * immediately visible to the auth client, and cookies the auth client drops
 * (sign-out, an expired session reported by `get-session`) leave the jar in
 * the same write.
 *
 * Mapping: a store entry `__Secure-better-auth.x` is the document cookie
 * `better-auth.x` (the `__Secure-` prefix only exists on the https Convex
 * origin). Every document cookie named `better-auth.*` belongs to the store —
 * a custom better-auth `cookiePrefix` is not supported. Expiry metadata is
 * translated to `Max-Age` on write and enforced by the browser; reads report
 * `expires: null`. Non-cookie keys (the crossDomainClient session-data cache)
 * fall through to localStorage.
 */
export const cookieJarStorage = {
  getItem(key: string): string | null {
    if (typeof document === "undefined") return null
    if (key !== COOKIE_STORAGE_KEY) return localStorage.getItem(key)
    const store: Record<string, StoredCookie> = {}
    for (const [name, value] of documentCookieEntries()) {
      if (name.startsWith(BETTER_AUTH_COOKIE_PREFIX)) {
        store[`${SECURE_COOKIE_PREFIX}${name}`] = { value, expires: null }
      }
    }
    return JSON.stringify(store)
  },

  setItem(key: string, value: string): void {
    if (typeof document === "undefined") return
    if (key !== COOKIE_STORAGE_KEY) {
      localStorage.setItem(key, value)
      return
    }
    const store = parseCookieJson(value)
    const written = new Set<string>()
    for (const [storedName, cookie] of Object.entries(store)) {
      const name = storedName.startsWith(SECURE_COOKIE_PREFIX)
        ? storedName.slice(SECURE_COOKIE_PREFIX.length)
        : storedName
      written.add(name)
      const expiresAtMs = cookie.expires
        ? new Date(cookie.expires).getTime()
        : NaN
      const maxAge = Number.isFinite(expiresAtMs)
        ? Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
        : DEFAULT_COOKIE_MAX_AGE
      document.cookie = `${name}=${cookie.value}; Path=/; SameSite=Lax; Max-Age=${maxAge}`
    }
    // Auth cookies dropped from the store must leave the jar too — this is
    // how crossDomainClient's sign-out wipe and its cleanup after a null
    // get-session (an expired token the server rejected) reach the browser.
    // Without it the dead token would be re-read on the next request and the
    // server would reject it again, forever.
    for (const [name] of documentCookieEntries()) {
      if (name.startsWith(BETTER_AUTH_COOKIE_PREFIX) && !written.has(name)) {
        document.cookie = `${name}=; Path=/; Max-Age=0`
      }
    }
  },
}
