/**
 * Cookie holding the signed anonymous restore token (`<userId>.<hmac>`).
 * Set by the browser client after anonymous sign-in, read by the Astro
 * middleware when `restoreAnonymousSessions` is enabled.
 */
export const ANON_IDENTITY_COOKIE = "anon_identity"

/**
 * Endpoint path registered by `restoreAnonymousPlugin`, relative to
 * better-auth's base path (`/api/auth`).
 */
export const RESTORE_ANONYMOUS_SESSION_PATH = "/restore-anonymous-session"

/**
 * Name prefix shared by every cookie better-auth issues (its default
 * `cookiePrefix`). `cookieJarStorage` uses it to tell which document cookies
 * belong to the auth store.
 */
export const BETTER_AUTH_COOKIE_PREFIX = "better-auth."

/** better-auth's session token cookie (unprefixed form used on the Astro origin). */
export const SESSION_TOKEN_COOKIE = `${BETTER_AUTH_COOKIE_PREFIX}session_token`

/** Convex JWT cookie set by @convex-dev/better-auth (unprefixed form). */
export const CONVEX_JWT_COOKIE = `${BETTER_AUTH_COOKIE_PREFIX}convex_jwt`

/**
 * Prefix the Convex backend (served over https) applies to its cookies.
 * Cookies forwarded to it must carry this prefix; cookies stored on the
 * Astro origin drop it.
 */
export const SECURE_COOKIE_PREFIX = "__Secure-"

/** localStorage key used by crossDomainClient() to store auth cookies. */
export const COOKIE_STORAGE_KEY = "better-auth_cookie"

/**
 * HTTP statuses from the restore endpoint that mean the restore token is
 * definitively rejected (malformed/invalid signature, user deleted, not
 * anonymous) — only these may clear the `anon_identity` cookie. Anything
 * else (5xx, 429, network) is transient and must keep the cookie so the
 * restore can be retried.
 */
export const RESTORE_REJECTION_STATUSES = new Set([400, 401, 404])
