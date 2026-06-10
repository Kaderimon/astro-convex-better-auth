// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cookieJarStorage } from "../../client/cookies"

const FIXED_NOW = new Date("2024-06-01T12:00:00Z")
const PAST = new Date("2024-05-01T12:00:00Z").toISOString()
const FUTURE_60S = new Date(FIXED_NOW.getTime() + 60_000).toISOString()

const STORAGE_KEY = "better-auth_cookie"
const CACHE_KEY = "better-auth_session_data"
const STORED_TOKEN_KEY = "__Secure-better-auth.session_token"
const STORED_JWT_KEY = "__Secure-better-auth.convex_jwt"

function clearDocumentCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  localStorage.clear()
  clearDocumentCookies()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  clearDocumentCookies()
})

describe("cookieJarStorage.getItem", () => {
  it("reconstructs the cookie store from better-auth.* document cookies with __Secure- keys", () => {
    document.cookie = "better-auth.session_token=tok123; Path=/"
    document.cookie = "better-auth.convex_jwt=jwt456; Path=/"

    const store = JSON.parse(cookieJarStorage.getItem(STORAGE_KEY)!)

    expect(store).toEqual({
      [STORED_TOKEN_KEY]: { value: "tok123", expires: null },
      [STORED_JWT_KEY]: { value: "jwt456", expires: null },
    })
  })

  it("ignores document cookies outside the better-auth prefix", () => {
    document.cookie = "anon_identity=u1.sig; Path=/"
    document.cookie = "unrelated=x; Path=/"

    expect(cookieJarStorage.getItem(STORAGE_KEY)).toBe("{}")
  })

  it("returns an empty store when the jar is empty", () => {
    expect(cookieJarStorage.getItem(STORAGE_KEY)).toBe("{}")
  })

  it("reads non-store keys from localStorage", () => {
    localStorage.setItem(CACHE_KEY, '{"user":{"id":"u1"}}')

    expect(cookieJarStorage.getItem(CACHE_KEY)).toBe('{"user":{"id":"u1"}}')
    expect(cookieJarStorage.getItem("missing")).toBeNull()
  })
})

describe("cookieJarStorage.setItem", () => {
  it("writes each store entry as a document cookie without the __Secure- prefix", () => {
    cookieJarStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "tok123", expires: null },
        [STORED_JWT_KEY]: { value: "jwt456", expires: null },
      }),
    )

    expect(document.cookie).toContain("better-auth.session_token=tok123")
    expect(document.cookie).toContain("better-auth.convex_jwt=jwt456")
  })

  it("derives Max-Age from the entry's expires timestamp", () => {
    const cookieSpy = vi.spyOn(document, "cookie", "set")

    cookieJarStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "tok", expires: FUTURE_60S },
      }),
    )

    expect(cookieSpy).toHaveBeenCalledWith(
      "better-auth.session_token=tok; Path=/; SameSite=Lax; Max-Age=60",
    )
    cookieSpy.mockRestore()
  })

  it("falls back to a 30-day Max-Age when expires is null", () => {
    const cookieSpy = vi.spyOn(document, "cookie", "set")

    cookieJarStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "tok", expires: null },
      }),
    )

    expect(cookieSpy).toHaveBeenCalledWith(
      "better-auth.session_token=tok; Path=/; SameSite=Lax; Max-Age=2592000",
    )
    cookieSpy.mockRestore()
  })

  it("writes already-expired entries with Max-Age=0, removing them from the jar", () => {
    document.cookie = "better-auth.session_token=old; Path=/"

    cookieJarStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "old", expires: PAST },
      }),
    )

    expect(document.cookie).not.toContain("better-auth.session_token")
  })

  it("deletes better-auth.* cookies that were dropped from the store", () => {
    // The mechanism behind crossDomainClient's sign-out wipe and its cleanup
    // after a null get-session: entries missing from the written store must
    // leave the jar, or the dead token would be re-sent forever.
    document.cookie = "better-auth.session_token=dead; Path=/"
    document.cookie = "better-auth.convex_jwt=stale; Path=/"

    cookieJarStorage.setItem(STORAGE_KEY, "{}")

    expect(document.cookie).not.toContain("better-auth.session_token")
    expect(document.cookie).not.toContain("better-auth.convex_jwt")
  })

  it("leaves cookies outside the better-auth prefix alone", () => {
    document.cookie = "anon_identity=u1.sig; Path=/"
    document.cookie = "better-auth.session_token=dead; Path=/"

    cookieJarStorage.setItem(STORAGE_KEY, "{}")

    expect(document.cookie).toContain("anon_identity=u1.sig")
  })

  it("tolerates malformed store JSON by clearing better-auth cookies only", () => {
    document.cookie = "better-auth.session_token=tok; Path=/"
    document.cookie = "anon_identity=u1.sig; Path=/"

    cookieJarStorage.setItem(STORAGE_KEY, "not-json")

    expect(document.cookie).not.toContain("better-auth.session_token")
    expect(document.cookie).toContain("anon_identity=u1.sig")
  })

  it("writes non-store keys to localStorage", () => {
    cookieJarStorage.setItem(CACHE_KEY, '{"user":{"id":"u1"}}')

    expect(localStorage.getItem(CACHE_KEY)).toBe('{"user":{"id":"u1"}}')
    expect(document.cookie).toBe("")
  })
})

describe("cookieJarStorage round-trip", () => {
  it("getItem returns what setItem wrote (values preserved, expires reported as null)", () => {
    cookieJarStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "tok123", expires: FUTURE_60S },
        [STORED_JWT_KEY]: { value: "jwt456", expires: null },
      }),
    )

    const store = JSON.parse(cookieJarStorage.getItem(STORAGE_KEY)!)
    expect(store).toEqual({
      [STORED_TOKEN_KEY]: { value: "tok123", expires: null },
      [STORED_JWT_KEY]: { value: "jwt456", expires: null },
    })
  })

  it("a session cookie set by the middleware is visible to the store without any sync step", () => {
    // What previously required adoptRestoredSessionCookie(): the middleware's
    // server-side restore only sets a document cookie, and the auth client
    // now reads it directly.
    document.cookie = "better-auth.session_token=restored-by-middleware; Path=/"

    const store = JSON.parse(cookieJarStorage.getItem(STORAGE_KEY)!)
    expect(store[STORED_TOKEN_KEY].value).toBe("restored-by-middleware")
  })
})
