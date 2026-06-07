import { beforeEach, describe, expect, it, vi } from "vitest"

// Top-level mock for non-cache tests (payload/error handling)
vi.mock("jose")

import { createRemoteJWKSet, jwtVerify } from "jose"
import { verifyConvexJwt } from "../../server/jwks"

const SITE_URL = "https://example.convex.cloud"
const TOKEN = "eyJhbGciOiJSUzI1NiJ9.test.token"

describe("verifyConvexJwt — payload and error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a stable mock JWKSet for non-cache tests
    vi.mocked(createRemoteJWKSet).mockReturnValue(vi.fn() as never)
  })

  it("returns decoded payload on successful verification", async () => {
    const payload = { sub: "user1", sessionId: "sess_123", iat: 1000, exp: 9999 }
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload,
      protectedHeader: { alg: "RS256" },
    } as never)

    const result = await verifyConvexJwt(TOKEN, SITE_URL)

    expect(result).toEqual(payload)
  })

  it("passes audience='convex' and issuer=siteUrl to jwtVerify", async () => {
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {},
      protectedHeader: { alg: "RS256" },
    } as never)

    await verifyConvexJwt(TOKEN, SITE_URL)

    expect(jwtVerify).toHaveBeenCalledWith(
      TOKEN,
      expect.any(Function),
      expect.objectContaining({ audience: "convex", issuer: SITE_URL }),
    )
  })

  it("returns null when jwtVerify throws (invalid token)", async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("invalid signature"))

    const result = await verifyConvexJwt("bad.token.here", SITE_URL)

    expect(result).toBeNull()
  })

  it("returns null when jwtVerify throws (expired token)", async () => {
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("JWT expired"))

    const result = await verifyConvexJwt(TOKEN, SITE_URL)

    expect(result).toBeNull()
  })
})

// Cache tests use fresh module instances via vi.resetModules() to avoid
// pollution from the module-level jwksSets Map shared across tests.
describe("verifyConvexJwt — JWKSet caching", () => {
  let freshVerify: typeof verifyConvexJwt
  let mockCreateRemoteJWKSet: ReturnType<typeof vi.fn>
  let mockJwtVerify: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    mockCreateRemoteJWKSet = vi.fn()
    mockJwtVerify = vi.fn()

    vi.doMock("jose", () => ({
      createRemoteJWKSet: mockCreateRemoteJWKSet,
      jwtVerify: mockJwtVerify,
    }))

    const jwksModule = await import("../../server/jwks")
    freshVerify = jwksModule.verifyConvexJwt
  })

  it("calls createRemoteJWKSet with the correct JWKS URL on first access", async () => {
    const mockJwks = vi.fn()
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks)
    mockJwtVerify.mockResolvedValueOnce({ payload: {}, protectedHeader: { alg: "RS256" } })

    await freshVerify(TOKEN, SITE_URL)

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
      new URL(`${SITE_URL}/api/auth/convex/jwks`),
    )
  })

  it("reuses the same JWKSet for the same siteUrl (createRemoteJWKSet called once for two calls)", async () => {
    const mockJwks = vi.fn()
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks)
    mockJwtVerify.mockResolvedValue({ payload: {}, protectedHeader: { alg: "RS256" } })

    await freshVerify(TOKEN, SITE_URL)
    await freshVerify(TOKEN, SITE_URL)

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(1)
  })

  it("creates a new JWKSet for a different siteUrl", async () => {
    const mockJwks = vi.fn()
    mockCreateRemoteJWKSet.mockReturnValue(mockJwks)
    mockJwtVerify.mockResolvedValue({ payload: {}, protectedHeader: { alg: "RS256" } })

    await freshVerify(TOKEN, SITE_URL)
    await freshVerify(TOKEN, "https://other.convex.cloud")

    expect(mockCreateRemoteJWKSet).toHaveBeenCalledTimes(2)
    expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
      new URL(`https://other.convex.cloud/api/auth/convex/jwks`),
    )
  })
})
