import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../server/env", () => ({
  getConvexSiteUrl: vi.fn(() => "https://example.convex.cloud"),
}))

vi.mock("@convex-dev/better-auth/utils", () => ({
  getToken: vi.fn(),
}))

import { getToken } from "@convex-dev/better-auth/utils"
import { authHandler, getConvexToken } from "../../server/auth-server"

const SITE_URL = "https://example.convex.cloud"

function makeRequest(path = "/api/auth/sign-in", options: RequestInit = {}) {
  return new Request(`http://myapp.example.com${path}`, {
    method: "POST",
    body: "{}",
    ...options,
  })
}

describe("authHandler", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("fetches the correct target URL (siteUrl + pathname + search)", async () => {
    await authHandler(makeRequest("/api/auth/sign-in?redirect=true"))

    expect(mockFetch).toHaveBeenCalledWith(
      `${SITE_URL}/api/auth/sign-in?redirect=true`,
      expect.any(Object),
    )
  })

  it("sets host header to the Convex site URL host", async () => {
    await authHandler(makeRequest())

    const headers: Headers = mockFetch.mock.calls[0][1].headers
    expect(headers.get("host")).toBe("example.convex.cloud")
  })

  it("sets x-forwarded-host to the incoming request host", async () => {
    await authHandler(makeRequest())

    const headers: Headers = mockFetch.mock.calls[0][1].headers
    expect(headers.get("x-forwarded-host")).toBe("myapp.example.com")
  })

  it("sets x-forwarded-proto to the incoming protocol (strips trailing colon)", async () => {
    await authHandler(makeRequest())

    const headers: Headers = mockFetch.mock.calls[0][1].headers
    expect(headers.get("x-forwarded-proto")).toBe("http")
  })

  it("sets x-better-auth-forwarded-host and x-better-auth-forwarded-proto", async () => {
    await authHandler(makeRequest())

    const headers: Headers = mockFetch.mock.calls[0][1].headers
    expect(headers.get("x-better-auth-forwarded-host")).toBe(
      "myapp.example.com",
    )
    expect(headers.get("x-better-auth-forwarded-proto")).toBe("http")
  })

  it("sets accept-encoding to 'identity'", async () => {
    await authHandler(makeRequest())

    const headers: Headers = mockFetch.mock.calls[0][1].headers
    expect(headers.get("accept-encoding")).toBe("identity")
  })

  it("passes redirect: 'manual' to fetch", async () => {
    await authHandler(makeRequest())

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "manual" }),
    )
  })

  it("passes duplex: 'half' to fetch for streaming body support", async () => {
    await authHandler(makeRequest())

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ duplex: "half" }),
    )
  })
})

describe("getConvexToken", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns token string when getToken resolves with a token", async () => {
    vi.mocked(getToken).mockResolvedValueOnce({
      token: "jwt-token-123",
    } as never)

    const result = await getConvexToken(new Headers())

    expect(result).toBe("jwt-token-123")
  })

  it("returns null when getToken resolves without a token", async () => {
    vi.mocked(getToken).mockResolvedValueOnce({ token: undefined } as never)

    const result = await getConvexToken(new Headers())

    expect(result).toBeNull()
  })

  it("strips content-length and transfer-encoding from headers before calling getToken", async () => {
    vi.mocked(getToken).mockResolvedValueOnce({ token: "t" } as never)

    const incoming = new Headers({
      "content-length": "42",
      "transfer-encoding": "chunked",
      authorization: "Bearer abc",
    })
    await getConvexToken(incoming)

    const passedHeaders: Headers = vi.mocked(getToken).mock.calls[0][1]
    expect(passedHeaders.get("content-length")).toBeNull()
    expect(passedHeaders.get("transfer-encoding")).toBeNull()
    expect(passedHeaders.get("authorization")).toBe("Bearer abc")
  })

  it("calls getToken with siteUrl and jwtCache enabled", async () => {
    vi.mocked(getToken).mockResolvedValueOnce({ token: "t" } as never)

    await getConvexToken(new Headers())

    expect(getToken).toHaveBeenCalledWith(
      SITE_URL,
      expect.any(Headers),
      expect.objectContaining({
        jwtCache: { enabled: true, isAuthError: expect.any(Function) },
      }),
    )
  })
})
