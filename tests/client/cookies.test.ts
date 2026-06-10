// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  adoptRestoredSessionCookie,
  buildBetterAuthCookieHeader,
  clearSessionCookiesFromDocument,
  getCookies,
  syncCookiesToDocument,
} from "../../client/cookies"

const FIXED_NOW = new Date("2024-06-01T12:00:00Z")
const PAST = new Date("2024-05-01T12:00:00Z").toISOString()
const FUTURE = new Date("2024-07-01T12:00:00Z").toISOString()

describe("getCookies", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns empty array for empty string", () => {
    expect(getCookies("")).toEqual([])
  })

  it("returns empty array for malformed JSON", () => {
    expect(getCookies("not-json")).toEqual([])
  })

  it("returns name=value strings for valid cookie JSON", () => {
    const raw = JSON.stringify({
      "my-cookie": { value: "abc", expires: FUTURE },
    })
    expect(getCookies(raw)).toEqual(["my-cookie=abc"])
  })

  it("strips __Secure- prefix from cookie names in the output", () => {
    const raw = JSON.stringify({
      "__Secure-better-auth.session_token": { value: "sess123", expires: FUTURE },
    })
    const result = getCookies(raw)
    expect(result).toEqual(["better-auth.session_token=sess123"])
  })

  it("filters out cookies with an expires date in the past", () => {
    const raw = JSON.stringify({
      "stale-cookie": { value: "old", expires: PAST },
    })
    expect(getCookies(raw)).toEqual([])
  })

  it("includes cookies with an expires date in the future", () => {
    const raw = JSON.stringify({
      "fresh-cookie": { value: "new", expires: FUTURE },
    })
    expect(getCookies(raw)).toEqual(["fresh-cookie=new"])
  })

  it("includes cookies with expires=null (session cookies)", () => {
    const raw = JSON.stringify({
      "session-cookie": { value: "abc", expires: null },
    })
    expect(getCookies(raw)).toEqual(["session-cookie=abc"])
  })

  it("handles multiple cookies, returning all non-expired ones", () => {
    const raw = JSON.stringify({
      "fresh-a": { value: "1", expires: FUTURE },
      "stale-b": { value: "2", expires: PAST },
      "session-c": { value: "3", expires: null },
    })
    const result = getCookies(raw)
    expect(result).toHaveLength(2)
    expect(result).toContain("fresh-a=1")
    expect(result).toContain("session-c=3")
  })
})

describe("syncCookiesToDocument", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it("reads 'better-auth_cookie' from localStorage", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem")
    syncCookiesToDocument()
    expect(getItemSpy).toHaveBeenCalledWith("better-auth_cookie")
    getItemSpy.mockRestore()
  })

  it("does not throw when localStorage key is absent", () => {
    expect(() => syncCookiesToDocument()).not.toThrow()
  })

  it("sets each valid cookie on document.cookie with correct attributes", () => {
    const raw = JSON.stringify({
      "test-cookie": { value: "hello", expires: FUTURE },
    })
    localStorage.setItem("better-auth_cookie", raw)

    const cookieSpy = vi.spyOn(document, "cookie", "set")
    syncCookiesToDocument()

    expect(cookieSpy).toHaveBeenCalledWith(
      expect.stringContaining("test-cookie=hello"),
    )
    expect(cookieSpy).toHaveBeenCalledWith(expect.stringContaining("Path=/"))
    expect(cookieSpy).toHaveBeenCalledWith(expect.stringContaining("SameSite=Lax"))
    expect(cookieSpy).toHaveBeenCalledWith(expect.stringContaining("Max-Age=2592000"))
    cookieSpy.mockRestore()
  })
})

const STORAGE_KEY = "better-auth_cookie"
const STORED_TOKEN_KEY = "__Secure-better-auth.session_token"

function clearDocumentCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

describe("adoptRestoredSessionCookie", () => {
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

  it("returns null when no session cookie is in document.cookie", () => {
    expect(adoptRestoredSessionCookie()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("adopts the cookie into an empty store with expires=null and returns the updated store", () => {
    document.cookie = "better-auth.session_token=restored123; Path=/"

    const adopted = adoptRestoredSessionCookie()

    expect(adopted?.[STORED_TOKEN_KEY]).toEqual({
      value: "restored123",
      expires: null,
    })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toEqual(adopted)
  })

  it("returns null when the store already holds the same valid token", () => {
    document.cookie = "better-auth.session_token=same; Path=/"
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [STORED_TOKEN_KEY]: { value: "same", expires: FUTURE } }),
    )

    expect(adoptRestoredSessionCookie()).toBeNull()
  })

  it("overwrites a differing stored token", () => {
    document.cookie = "better-auth.session_token=fresh; Path=/"
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [STORED_TOKEN_KEY]: { value: "stale", expires: FUTURE } }),
    )

    expect(adoptRestoredSessionCookie()?.[STORED_TOKEN_KEY].value).toBe("fresh")
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[STORED_TOKEN_KEY].value).toBe("fresh")
  })

  it("re-adopts when the stored entry has expired, even with the same value", () => {
    document.cookie = "better-auth.session_token=tok; Path=/"
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [STORED_TOKEN_KEY]: { value: "tok", expires: PAST } }),
    )

    expect(adoptRestoredSessionCookie()).not.toBeNull()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored[STORED_TOKEN_KEY]).toEqual({ value: "tok", expires: null })
  })

  it("preserves other entries in the store", () => {
    document.cookie = "better-auth.session_token=tok; Path=/"
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ other: { value: "keep", expires: null } }),
    )

    adoptRestoredSessionCookie()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.other).toEqual({ value: "keep", expires: null })
  })
})

describe("buildBetterAuthCookieHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it("returns empty string for an empty store", () => {
    expect(buildBetterAuthCookieHeader()).toBe("")
  })

  it("keeps the __Secure- prefix and joins entries with '; '", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        [STORED_TOKEN_KEY]: { value: "tok", expires: null },
        "__Secure-better-auth.convex_jwt": { value: "jwt", expires: FUTURE },
      }),
    )

    expect(buildBetterAuthCookieHeader()).toBe(
      `${STORED_TOKEN_KEY}=tok; __Secure-better-auth.convex_jwt=jwt`,
    )
  })

  it("filters out expired entries", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fresh: { value: "a", expires: FUTURE },
        stale: { value: "b", expires: PAST },
      }),
    )

    expect(buildBetterAuthCookieHeader()).toBe("fresh=a")
  })

  it("uses a pre-parsed store when one is passed, ignoring localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ignored: { value: "x", expires: null } }),
    )

    expect(
      buildBetterAuthCookieHeader({
        [STORED_TOKEN_KEY]: { value: "tok", expires: null },
      }),
    ).toBe(`${STORED_TOKEN_KEY}=tok`)
  })
})

describe("clearSessionCookiesFromDocument", () => {
  it("expires the session_token and convex_jwt cookies", () => {
    const cookieSpy = vi.spyOn(document, "cookie", "set")

    clearSessionCookiesFromDocument()

    expect(cookieSpy).toHaveBeenCalledWith(
      "better-auth.session_token=; Path=/; Max-Age=0",
    )
    expect(cookieSpy).toHaveBeenCalledWith(
      "better-auth.convex_jwt=; Path=/; Max-Age=0",
    )
    cookieSpy.mockRestore()
  })
})
