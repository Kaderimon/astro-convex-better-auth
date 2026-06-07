import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getConvexSiteUrl } from "../../server/env"

describe("getConvexSiteUrl", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_CONVEX_SITE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns the URL when PUBLIC_CONVEX_SITE_URL is set", () => {
    vi.stubEnv("PUBLIC_CONVEX_SITE_URL", "https://example.convex.cloud")
    expect(getConvexSiteUrl()).toBe("https://example.convex.cloud")
  })

  it("throws with descriptive message when PUBLIC_CONVEX_SITE_URL is not set", () => {
    expect(() => getConvexSiteUrl()).toThrow(
      "[astro-convex-better-auth] PUBLIC_CONVEX_SITE_URL is not set",
    )
  })

  it("throws when PUBLIC_CONVEX_SITE_URL is empty string", () => {
    vi.stubEnv("PUBLIC_CONVEX_SITE_URL", "")
    expect(() => getConvexSiteUrl()).toThrow("PUBLIC_CONVEX_SITE_URL is not set")
  })
})
