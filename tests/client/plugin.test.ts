// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { astroConvexClient } from "../../client/plugin"

const STORAGE_KEY = "better-auth_cookie"
const STORED_TOKEN_KEY = "__Secure-better-auth.session_token"

function clearDocumentCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

function getFetchPlugin(options?: { restoreAnonymousSessions?: boolean }) {
  return astroConvexClient(options).fetchPlugins![0]
}

// Wires the plugin's getActions with a mock $fetch so the client-side
// restore path can be exercised; returns the recorded restore calls.
function getPluginWithAuthFetch(
  options?: { restoreAnonymousSessions?: boolean },
  error: { status: number } | null = null,
) {
  const plugin = astroConvexClient(options)
  const calls: Array<{ path: string; body: Record<string, string> }> = []
  const mockFetch = (path: string, opts: { body: Record<string, string> }) => {
    calls.push({ path, body: opts.body })
    return Promise.resolve({ error })
  }
  plugin.getActions!(mockFetch as never, undefined as never, undefined as never)
  return { fetchPlugin: plugin.fetchPlugins![0], calls }
}

const flushAsync = () => new Promise((r) => setTimeout(r, 0))

function makeSuccessContext(
  url: string,
  data: unknown,
  headers?: Record<string, string>,
) {
  return { data, request: new Request(url, { headers }), response: new Response() }
}

function headersOf(initResult: unknown): Record<string, string> {
  return (
    (initResult as { options?: { headers?: Record<string, string> } }).options
      ?.headers ?? {}
  )
}

const SIGN_IN_URL = "https://example.convex.site/api/auth/sign-in/anonymous"
const SIGN_OUT_URL = "https://example.convex.site/api/auth/sign-out"
const OTHER_URL = "https://example.convex.site/api/auth/get-session"

describe("astroConvexClient", () => {
  beforeEach(() => {
    localStorage.clear()
    clearDocumentCookies()
  })

  afterEach(() => {
    localStorage.clear()
    clearDocumentCookies()
  })

  describe("flag off (default)", () => {
    it("does not set the anon_identity cookie on anonymous sign-in", async () => {
      const plugin = getFetchPlugin()

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(SIGN_IN_URL, {
          user: { id: "u1" },
          restoreToken: "u1.sig",
        }) as never,
      )

      expect(document.cookie).not.toContain("anon_identity")
    })

    it("init does not touch localStorage or headers", async () => {
      document.cookie = "better-auth.session_token=restored; Path=/"
      const plugin = getFetchPlugin()
      const options = { headers: { "Better-Auth-Cookie": "stale" } }

      const result = await plugin.init!(OTHER_URL, options as never)

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(headersOf(result)).toEqual({ "Better-Auth-Cookie": "stale" })
    })

    it("does not clear session cookies when get-session returns null", async () => {
      document.cookie = "better-auth.session_token=dead; Path=/"
      const plugin = getFetchPlugin()

      await plugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)

      expect(document.cookie).toContain("better-auth.session_token=dead")
    })
  })

  describe("flag on", () => {
    const enabled = { restoreAnonymousSessions: true }

    it("sets the anon_identity cookie from restoreToken on anonymous sign-in", async () => {
      const plugin = getFetchPlugin(enabled)

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(SIGN_IN_URL, {
          user: { id: "u1" },
          restoreToken: "u1.sig",
        }) as never,
      )

      expect(document.cookie).toContain("anon_identity=u1.sig")
    })

    it("clears anon_identity and session cookies on sign-out", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      document.cookie = "better-auth.session_token=tok; Path=/"
      const plugin = getFetchPlugin(enabled)

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(SIGN_OUT_URL, {}) as never,
      )

      expect(document.cookie).not.toContain("anon_identity")
      expect(document.cookie).not.toContain("better-auth.session_token")
    })

    it("init adopts a restored session cookie and rewrites the header", async () => {
      document.cookie = "better-auth.session_token=restored; Path=/"
      const plugin = getFetchPlugin(enabled)
      const options = { headers: { "Better-Auth-Cookie": "stale" } }

      const result = await plugin.init!(OTHER_URL, options as never)

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(stored[STORED_TOKEN_KEY].value).toBe("restored")
      expect(headersOf(result)).toEqual({
        "Better-Auth-Cookie": `${STORED_TOKEN_KEY}=restored`,
      })
    })

    it("init leaves everything untouched when stores already agree", async () => {
      document.cookie = "better-auth.session_token=tok; Path=/"
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ [STORED_TOKEN_KEY]: { value: "tok", expires: null } }),
      )
      const plugin = getFetchPlugin(enabled)
      const options = { headers: { "Better-Auth-Cookie": "from-cross-domain" } }

      const result = await plugin.init!(OTHER_URL, options as never)

      expect(headersOf(result)).toEqual({
        "Better-Auth-Cookie": "from-cross-domain",
      })
    })

    it("init skips adoption for sign-out requests", async () => {
      document.cookie = "better-auth.session_token=revoked; Path=/"
      const plugin = getFetchPlugin(enabled)

      await plugin.init!(SIGN_OUT_URL, undefined as never)

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it("clears dead session cookies (but not anon_identity) when get-session returns null", async () => {
      // Regression: re-adopting a token the server just rejected caused an
      // endless get-session loop after the session expired with the page open.
      document.cookie = "better-auth.session_token=dead; Path=/"
      document.cookie = "anon_identity=u1.sig; Path=/"
      const plugin = getFetchPlugin(enabled)

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(OTHER_URL, null, {
          "Better-Auth-Cookie": `${STORED_TOKEN_KEY}=dead`,
        }) as never,
      )

      expect(document.cookie).not.toContain("better-auth.session_token")
      expect(document.cookie).toContain("anon_identity=u1.sig")
    })

    it("does not clear session cookies when get-session returns a session", async () => {
      document.cookie = "better-auth.session_token=alive; Path=/"
      const plugin = getFetchPlugin(enabled)

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(OTHER_URL, { user: { id: "u1" }, session: { id: "s1" } }) as never,
      )

      expect(document.cookie).toContain("better-auth.session_token=alive")
    })
  })

  describe("client-side restore on expired session", () => {
    const enabled = { restoreAnonymousSessions: true }

    it("calls the restore endpoint when get-session is null and anon_identity exists", async () => {
      document.cookie = `anon_identity=${encodeURIComponent("u1.sig+/=")}; Path=/`
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(calls).toEqual([
        { path: "/restore-anonymous-session", body: { token: "u1.sig+/=" } },
      ])
    })

    it("does not call the restore endpoint without an anon_identity cookie", async () => {
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(calls).toEqual([])
    })

    it("does not call the restore endpoint when the flag is off", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch()

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(calls).toEqual([])
    })

    it("rate-limits restore attempts", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled, { status: 500 })

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()
      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(calls).toHaveLength(1)
    })

    it("clears the anon_identity cookie when the backend rejects the token", async () => {
      document.cookie = "anon_identity=u1.badsig; Path=/"
      const { fetchPlugin } = getPluginWithAuthFetch(enabled, { status: 401 })

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(document.cookie).not.toContain("anon_identity")
    })

    it("keeps the anon_identity cookie on transient restore failures (5xx)", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin } = getPluginWithAuthFetch(enabled, { status: 503 })

      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()

      expect(document.cookie).toContain("anon_identity=u1.sig")
    })

    it("ignores stale null get-session responses that raced a successful restore", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      // First null triggers the restore, which succeeds.
      await fetchPlugin.hooks!.onSuccess!(makeSuccessContext(OTHER_URL, null) as never)
      await flushAsync()
      expect(calls).toHaveLength(1)

      // A stale in-flight get-session that was sent with the old (now dead)
      // token lands null after the restore. Its verdict is about the old
      // token, not the one in the jar — the fresh cookie must survive and
      // no second restore should fire.
      document.cookie = "better-auth.session_token=fresh-restored; Path=/"
      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(OTHER_URL, null, {
          "Better-Auth-Cookie": `${STORED_TOKEN_KEY}=old-dead-token`,
        }) as never,
      )
      await flushAsync()

      expect(document.cookie).toContain("better-auth.session_token=fresh-restored")
      expect(calls).toHaveLength(1)
    })
  })
})
