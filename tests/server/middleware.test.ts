import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../server/env", () => ({
  getConvexSiteUrl: vi.fn(() => "https://example.convex.cloud"),
}))

vi.mock("../../server/auth-server", () => ({
  authHandler: vi.fn(),
  getConvexToken: vi.fn(),
}))

vi.mock("../../server/jwks", () => ({
  verifyConvexJwt: vi.fn(),
}))

import { authHandler, getConvexToken } from "../../server/auth-server"
import { verifyConvexJwt } from "../../server/jwks"
import { convexBetterAuthMiddleware } from "../../server/middleware"

const SITE_URL = "https://example.convex.cloud"

type AstroLocals = {
  user: unknown
  session: unknown
  convexToken?: unknown
}

function makeContext(
  path: string,
  cookieHeader?: string,
): { url: URL; request: Request; locals: AstroLocals } {
  const headers = new Headers()
  if (cookieHeader !== undefined) {
    headers.set("cookie", cookieHeader)
  }
  return {
    url: new URL(`http://myapp.example.com${path}`),
    request: new Request(`http://myapp.example.com${path}`, { headers }),
    locals: {} as AstroLocals,
  }
}

const mockNext = vi.fn(async () => new Response("next"))
const mockAuthResponse = new Response("auth-response", { status: 200 })

describe("convexBetterAuthMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNext.mockResolvedValue(new Response("next"))
    vi.mocked(authHandler).mockResolvedValue(mockAuthResponse)
    vi.mocked(getConvexToken).mockResolvedValue("convex-jwt-token")
    vi.mocked(verifyConvexJwt).mockResolvedValue(null)
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("/api/auth/* routing", () => {
    it("routes /api/auth/sign-in to authHandler without calling next", async () => {
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/api/auth/sign-in")

      const result = await mw(ctx as never, mockNext)

      expect(authHandler).toHaveBeenCalledWith(ctx.request)
      expect(mockNext).not.toHaveBeenCalled()
      expect(result).toBe(mockAuthResponse)
    })

    it("routes /api/auth/get-session to authHandler", async () => {
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/api/auth/get-session")

      await mw(ctx as never, mockNext)

      expect(authHandler).toHaveBeenCalled()
      expect(mockNext).not.toHaveBeenCalled()
    })

    it("routes any /api/auth path to authHandler", async () => {
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/api/auth/callback/google")

      await mw(ctx as never, mockNext)

      expect(authHandler).toHaveBeenCalled()
    })
  })

  describe("no cookie header", () => {
    it("sets user=null, session=null and calls next when no cookie present", async () => {
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.user).toBeNull()
      expect(ctx.locals.session).toBeNull()
      expect(mockNext).toHaveBeenCalled()
    })

    it("sets convexToken=null when includeConvexToken=true and no cookie", async () => {
      const mw = convexBetterAuthMiddleware({ includeConvexToken: true })
      const ctx = makeContext("/dashboard")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.convexToken).toBeNull()
    })
  })

  describe("no relevant cookies", () => {
    it("sets user=null, session=null and calls next when cookie has no forwarded names", async () => {
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "some-other-cookie=value")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.user).toBeNull()
      expect(ctx.locals.session).toBeNull()
      expect(mockNext).toHaveBeenCalled()
    })

    it("sets convexToken=null when includeConvexToken=true and no relevant cookies", async () => {
      const mw = convexBetterAuthMiddleware({ includeConvexToken: true })
      const ctx = makeContext("/dashboard", "other=abc")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.convexToken).toBeNull()
    })
  })

  describe("cookie filtering and prefixing", () => {
    const SESSION_COOKIE =
      "better-auth.session_token=sess123; better-auth.convex_jwt=jwt456; unrelated=skip"

    it("forwards only better-auth.convex_jwt and better-auth.session_token to get-session", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "u1" }, session: { id: "s1" } }), {
          status: 200,
        }),
      )
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", SESSION_COOKIE)

      await mw(ctx as never, mockNext)

      const sentCookie: string =
        mockFetch.mock.calls[0][1].headers["Better-Auth-Cookie"]
      expect(sentCookie).toContain("better-auth.session_token")
      expect(sentCookie).toContain("better-auth.convex_jwt")
      expect(sentCookie).not.toContain("unrelated")
    })

    it("prefixes forwarded cookies with __Secure-", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: null, session: null }), { status: 200 }),
      )
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=abc123")

      await mw(ctx as never, mockNext)

      const sentCookie: string =
        mockFetch.mock.calls[0][1].headers["Better-Auth-Cookie"]
      expect(sentCookie).toContain("__Secure-better-auth.session_token=abc123")
    })

    it("does not forward unrelated cookies to get-session", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ user: null, session: null }), { status: 200 }),
      )
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s; theme=dark")

      await mw(ctx as never, mockNext)

      const sentCookie: string =
        mockFetch.mock.calls[0][1].headers["Better-Auth-Cookie"]
      expect(sentCookie).not.toContain("theme")
    })
  })

  describe("successful get-session", () => {
    const sessionData = { user: { id: "u1", name: "Alice" }, session: { id: "s1" } }

    function setupFetchSuccess() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(sessionData), { status: 200 }),
        ),
      )
    }

    it("populates context.locals.user and context.locals.session from get-session JSON", async () => {
      setupFetchSuccess()
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.user).toEqual(sessionData.user)
      expect(ctx.locals.session).toEqual(sessionData.session)
    })

    it("calls next after successful get-session", async () => {
      setupFetchSuccess()
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it("sets convexToken via getConvexToken when includeConvexToken=true", async () => {
      setupFetchSuccess()
      const mw = convexBetterAuthMiddleware({ includeConvexToken: true })
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(getConvexToken).toHaveBeenCalled()
      expect(ctx.locals.convexToken).toBe("convex-jwt-token")
    })
  })

  describe("failed get-session", () => {
    it("sets user=null and session=null when get-session returns non-ok response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.user).toBeNull()
      expect(ctx.locals.session).toBeNull()
    })

    it("sets user=null and session=null when fetch throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(ctx.locals.user).toBeNull()
      expect(ctx.locals.session).toBeNull()
    })

    it("calls next even when fetch throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(mockNext).toHaveBeenCalled()
    })

    it("logs a warning when fetch throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      )
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[astro-convex-better-auth]"),
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })
  })

  describe("jwtFastPath — fast path hit", () => {
    const JWT_COOKIE =
      "better-auth.convex_jwt=eyJ.test.jwt; better-auth.session_token=s"
    // JWT_STANDARD_CLAIMS filtered: iss, sub, aud, exp, nbf, iat, jti, sessionId
    const jwtPayload = {
      sub: "user1",          // filtered by JWT_STANDARD_CLAIMS
      sessionId: "sess_abc", // destructured separately
      name: "Alice",
      email: "alice@example.com",
      iat: 1000,             // filtered
      exp: 9999,             // filtered
      iss: SITE_URL,         // filtered
      aud: "convex",         // filtered
    }

    beforeEach(() => {
      vi.mocked(verifyConvexJwt).mockResolvedValue(jwtPayload)
    })

    it("skips get-session when verifyConvexJwt returns valid payload", async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext("/dashboard", JWT_COOKIE)

      await mw(ctx as never, mockNext)

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("strips sub, iss, aud, iat, exp and sessionId from user payload (JWT_STANDARD_CLAIMS)", async () => {
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext("/dashboard", JWT_COOKIE)

      await mw(ctx as never, mockNext)

      // Only non-standard, non-sessionId fields remain
      expect(ctx.locals.user).toEqual({ name: "Alice", email: "alice@example.com" })
    })

    it("builds session as {id: sessionId} when sessionId is present", async () => {
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext("/dashboard", JWT_COOKIE)

      await mw(ctx as never, mockNext)

      expect(ctx.locals.session).toEqual({ id: "sess_abc" })
    })

    it("sets session=null when sessionId is absent from JWT payload", async () => {
      const { sessionId: _, ...payloadWithoutSession } = jwtPayload
      vi.mocked(verifyConvexJwt).mockResolvedValue(payloadWithoutSession)
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext("/dashboard", JWT_COOKIE)

      await mw(ctx as never, mockNext)

      expect(ctx.locals.session).toBeNull()
    })

    it("sets convexToken when includeConvexToken=true on fast path", async () => {
      const mw = convexBetterAuthMiddleware({
        jwtFastPath: true,
        includeConvexToken: true,
      })
      const ctx = makeContext("/dashboard", JWT_COOKIE)

      await mw(ctx as never, mockNext)

      expect(getConvexToken).toHaveBeenCalled()
      expect(ctx.locals.convexToken).toBe("convex-jwt-token")
    })
  })

  describe("jwtFastPath — fallback to get-session", () => {
    function setupFetchSuccess(data = { user: { id: "u1" }, session: { id: "s1" } }) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(data), { status: 200 }),
        ),
      )
    }

    it("falls back to get-session when jwt cookie is missing (only session_token present)", async () => {
      setupFetchSuccess()
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext("/dashboard", "better-auth.session_token=s")

      await mw(ctx as never, mockNext)

      expect(fetch).toHaveBeenCalledWith(
        `${SITE_URL}/api/auth/get-session`,
        expect.any(Object),
      )
    })

    it("falls back to get-session when verifyConvexJwt returns null", async () => {
      setupFetchSuccess()
      vi.mocked(verifyConvexJwt).mockResolvedValue(null)
      const mw = convexBetterAuthMiddleware({ jwtFastPath: true })
      const ctx = makeContext(
        "/dashboard",
        "better-auth.convex_jwt=bad; better-auth.session_token=s",
      )

      await mw(ctx as never, mockNext)

      expect(fetch).toHaveBeenCalledWith(
        `${SITE_URL}/api/auth/get-session`,
        expect.any(Object),
      )
    })
  })
})
