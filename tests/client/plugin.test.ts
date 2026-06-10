// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { astroConvexClient } from "../../client/plugin"

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

// Flushes microtasks (and any timers due within the given window) under fake
// timers, so the async restore promise chain settles deterministically.
const flushAsync = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

function makeSuccessContext(
  url: string,
  data: unknown,
  headers?: Record<string, string>,
) {
  return { data, request: new Request(url, { headers }), response: new Response() }
}

const SIGN_IN_URL = "https://example.convex.site/api/auth/sign-in/anonymous"
const SIGN_OUT_URL = "https://example.convex.site/api/auth/sign-out"
const GET_SESSION_URL = "https://example.convex.site/api/auth/get-session"

describe("astroConvexClient", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    clearDocumentCookies()
  })

  afterEach(() => {
    vi.useRealTimers()
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

    it("does not call the restore endpoint when get-session returns null", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch()

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      expect(calls).toEqual([])
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

    it("clears the anon_identity cookie on sign-out", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const plugin = getFetchPlugin(enabled)

      await plugin.hooks!.onSuccess!(
        makeSuccessContext(SIGN_OUT_URL, {}) as never,
      )

      expect(document.cookie).not.toContain("anon_identity")
    })
  })

  describe("client-side restore on expired session", () => {
    const enabled = { restoreAnonymousSessions: true }

    it("calls the restore endpoint when get-session is null and anon_identity exists", async () => {
      document.cookie = `anon_identity=${encodeURIComponent("u1.sig+/=")}; Path=/`
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      expect(calls).toEqual([
        { path: "/restore-anonymous-session", body: { token: "u1.sig+/=" } },
      ])
    })

    it("does not call the restore endpoint without an anon_identity cookie", async () => {
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      expect(calls).toEqual([])
    })

    it("skips the restore when a session token is already back in the jar", async () => {
      // E.g. a concurrent restore already succeeded — there is a live session,
      // nothing to restore.
      document.cookie = "anon_identity=u1.sig; Path=/"
      document.cookie = "better-auth.session_token=alive; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null, {
          "Better-Auth-Cookie": `${STORED_TOKEN_KEY}=alive`,
        }) as never,
      )
      await flushAsync()

      expect(calls).toEqual([])
    })

    it("ignores stale null get-session responses that raced a successful restore", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled)

      // First null triggers the restore, which succeeds.
      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()
      expect(calls).toHaveLength(1)

      // A stale in-flight get-session that was sent with the old (now dead)
      // token lands null after the restore. Its verdict is about the old
      // token, not the fresh one in the jar — no second restore should fire.
      document.cookie = "better-auth.session_token=fresh-restored; Path=/"
      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null, {
          "Better-Auth-Cookie": `${STORED_TOKEN_KEY}=old-dead-token`,
        }) as never,
      )
      await flushAsync()

      expect(document.cookie).toContain("better-auth.session_token=fresh-restored")
      expect(calls).toHaveLength(1)
    })

    it("rate-limits restore attempts and retries once the window elapses", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled, { status: 503 })

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()
      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      // Second attempt is inside the rate-limit window…
      expect(calls).toHaveLength(1)

      // …but a single retry is scheduled for the window's end, so a stale
      // null that wiped a freshly restored token cannot strand the user.
      await flushAsync(5_000)
      expect(calls).toHaveLength(2)
    })

    it("cancels a scheduled retry on sign-out", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin, calls } = getPluginWithAuthFetch(enabled, { status: 503 })

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()
      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()
      expect(calls).toHaveLength(1)

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(SIGN_OUT_URL, {}) as never,
      )
      await flushAsync(5_000)

      expect(calls).toHaveLength(1)
    })

    it("clears the anon_identity cookie when the backend rejects the token", async () => {
      document.cookie = "anon_identity=u1.badsig; Path=/"
      const { fetchPlugin } = getPluginWithAuthFetch(enabled, { status: 401 })

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      expect(document.cookie).not.toContain("anon_identity")
    })

    it("keeps the anon_identity cookie on transient restore failures (5xx)", async () => {
      document.cookie = "anon_identity=u1.sig; Path=/"
      const { fetchPlugin } = getPluginWithAuthFetch(enabled, { status: 503 })

      await fetchPlugin.hooks!.onSuccess!(
        makeSuccessContext(GET_SESSION_URL, null) as never,
      )
      await flushAsync()

      expect(document.cookie).toContain("anon_identity=u1.sig")
    })
  })
})
