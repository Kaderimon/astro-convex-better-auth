// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getCookies, syncCookiesToDocument } from "../../client/cookies"

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
