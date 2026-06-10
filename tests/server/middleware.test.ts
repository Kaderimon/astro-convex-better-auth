import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../server/env", () => ({
  getConvexSiteUrl: vi.fn(() => "https://example.convex.cloud"),
}))

vi.mock("../../server/auth-server", () => ({
  authHandler: vi.fn(),
  getConvexToken: vi.fn(),
}))

import { authHandler, getConvexToken } from "../../server/auth-server"
import { convexBetterAuthMiddleware } from "../../server/middleware"

const SITE_URL = "https://example.convex.cloud"

type AstroLocals = {
  user: unknown
  session: unknown
  convexToken?: unknown
}

type AstroCookies = {
  set: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function makeContext(
  path: string,
  cookieHeader?: string,
): { url: URL; request: Request; locals: AstroLocals; cookies: AstroCookies } {
  const headers = new Headers()
  if (cookieHeader !== undefined) {
    headers.set("cookie", cookieHeader)
  }
  return {
    url: new URL(`http://myapp.example.com${path}`),
    request: new Request(`http://myapp.example.com${path}`, { headers }),
    locals: {} as AstroLocals,
    cookies: { set: vi.fn(), delete: vi.fn() },
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

  describe("refreshed session cookie propagation", () => {
    const sessionData = { user: { id: "u1" }, session: { id: "s1" } }

    function setupFetchWithSetCookie(
      setCookie: string | null,
      body: unknown = sessionData,
    ) {
      const headers = new Headers({ "Content-Type": "application/json" })
      if (setCookie !== null) {
        headers.set("Set-Better-Auth-Cookie", setCookie)
      }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body), { status: 200, headers }),
        ),
      )
    }

    it("re-sets a refreshed session_token cookie with the new maxAge", async () => {
      setupFetchWithSetCookie(
        "__Secure-better-auth.session_token=newtok; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None",
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=oldtok")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.set).toHaveBeenCalledWith(
        "better-auth.session_token",
        "newtok",
        expect.objectContaining({ path: "/", sameSite: "lax", maxAge: 604800 }),
      )
    })

    it("propagates only forwarded cookie names", async () => {
      setupFetchWithSetCookie(
        [
          "__Secure-better-auth.session_token=newtok; Max-Age=600; Path=/",
          "__Secure-better-auth.convex_jwt=newjwt; Max-Age=600; Path=/",
          "__Secure-better-auth.session_data=cache; Max-Age=600; Path=/",
        ].join(", "),
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=oldtok")

      await mw(ctx as never, mockNext)

      const setNames = ctx.cookies.set.mock.calls.map((call) => call[0])
      expect(setNames).toContain("better-auth.session_token")
      expect(setNames).toContain("better-auth.convex_jwt")
      expect(setNames).not.toContain("better-auth.session_data")
    })

    it("derives maxAge from Expires when Max-Age is absent", async () => {
      const expires = new Date(Date.now() + 120_000).toUTCString()
      setupFetchWithSetCookie(
        `__Secure-better-auth.session_token=newtok; Expires=${expires}; Path=/`,
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=oldtok")

      await mw(ctx as never, mockNext)

      const { maxAge } = ctx.cookies.set.mock.calls[0][2]
      expect(maxAge).toBeGreaterThan(0)
      expect(maxAge).toBeLessThanOrEqual(120)
    })

    it("does not touch cookies when no Set-Better-Auth-Cookie header is present", async () => {
      setupFetchWithSetCookie(null)
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=oldtok")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.set).not.toHaveBeenCalled()
    })

    it("does not propagate cookies when get-session returns no session", async () => {
      setupFetchWithSetCookie(
        "__Secure-better-auth.session_token=; Max-Age=0; Path=/",
        null,
      )
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "better-auth.session_token=oldtok")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.set).not.toHaveBeenCalled()
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

  describe("restoreAnonymousSessions", () => {
    const RESTORE_URL = `${SITE_URL}/api/auth/restore-anonymous-session`
    const restoredData = {
      sessionToken: "tok123",
      user: { id: "u1", isAnonymous: true },
      session: {
        id: "s2",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    }

    function setupRestoreFetch() {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.endsWith("/get-session")) {
          return new Response(JSON.stringify({ user: null, session: null }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify(restoredData), { status: 200 })
      })
      vi.stubGlobal("fetch", mockFetch)
      return mockFetch
    }

    it("restores the session when only the anon_identity cookie is present", async () => {
      const mockFetch = setupRestoreFetch()
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(mockFetch).toHaveBeenCalledWith(
        RESTORE_URL,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "u1.sig" }),
        }),
      )
      expect(ctx.locals.user).toEqual(restoredData.user)
      expect(ctx.locals.session).toEqual(restoredData.session)
      expect(mockNext).toHaveBeenCalled()
    })

    it("sets a session cookie with maxAge derived from session.expiresAt", async () => {
      setupRestoreFetch()
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.set).toHaveBeenCalledWith(
        "better-auth.session_token",
        "tok123",
        expect.objectContaining({ path: "/", sameSite: "lax" }),
      )
      const { maxAge } = ctx.cookies.set.mock.calls[0][2]
      expect(maxAge).toBeGreaterThan(0)
      expect(maxAge).toBeLessThanOrEqual(60)
    })

    it("attempts restore after get-session returns no session", async () => {
      const mockFetch = setupRestoreFetch()
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext(
        "/dashboard",
        "better-auth.session_token=expired; anon_identity=u1.sig",
      )

      await mw(ctx as never, mockNext)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(ctx.locals.user).toEqual(restoredData.user)
      expect(ctx.locals.session).toEqual(restoredData.session)
    })

    it("does not call the restore endpoint when the option is disabled", async () => {
      const mockFetch = vi.fn()
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware()
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(mockFetch).not.toHaveBeenCalled()
      expect(ctx.locals.user).toBeNull()
      expect(ctx.locals.session).toBeNull()
    })

    it("does not restore when a valid session already exists", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ user: { id: "u1" }, session: { id: "s1" } }),
          { status: 200 },
        ),
      )
      vi.stubGlobal("fetch", mockFetch)
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext(
        "/dashboard",
        "better-auth.session_token=s; anon_identity=u1.sig",
      )

      await mw(ctx as never, mockNext)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(ctx.locals.session).toEqual({ id: "s1" })
    })

    it("clears the anon_identity cookie when the restore endpoint rejects", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
      )
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.badsig")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.delete).toHaveBeenCalledWith("anon_identity", {
        path: "/",
      })
      expect(ctx.locals.session).toBeNull()
      expect(mockNext).toHaveBeenCalled()
    })

    it("keeps the anon_identity cookie on transient restore failures (5xx)", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("Service Unavailable", { status: 503 }),
          ),
      )
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.delete).not.toHaveBeenCalled()
      expect(ctx.locals.session).toBeNull()
      expect(mockNext).toHaveBeenCalled()
    })

    it("omits maxAge when session.expiresAt is missing or unparsable", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              sessionToken: "tok123",
              user: { id: "u1", isAnonymous: true },
              session: { id: "s2" },
            }),
            { status: 200 },
          ),
        ),
      )
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.set).toHaveBeenCalledWith(
        "better-auth.session_token",
        "tok123",
        expect.objectContaining({ path: "/", sameSite: "lax" }),
      )
      const cookieOptions = ctx.cookies.set.mock.calls[0][2]
      expect("maxAge" in cookieOptions).toBe(false)
    })

    it("keeps the cookie and proceeds unauthenticated on network error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      )
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const mw = convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      expect(ctx.cookies.delete).not.toHaveBeenCalled()
      expect(ctx.locals.session).toBeNull()
      expect(mockNext).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it("sets convexToken for the restored session when includeConvexToken=true", async () => {
      setupRestoreFetch()
      const mw = convexBetterAuthMiddleware({
        restoreAnonymousSessions: true,
        includeConvexToken: true,
      })
      const ctx = makeContext("/dashboard", "anon_identity=u1.sig")

      await mw(ctx as never, mockNext)

      const tokenHeaders = vi.mocked(getConvexToken).mock.calls.at(-1)?.[0]
      expect(tokenHeaders?.get("cookie")).toBe(
        "better-auth.session_token=tok123",
      )
      expect(ctx.locals.convexToken).toBe("convex-jwt-token")
    })
  })
})
