// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockAuthClient = { signIn: { anonymous: vi.fn() }, signOut: vi.fn(), convex: {} }
const createAuthClientMock = vi.fn(() => mockAuthClient)
const convexClientPluginMock = vi.fn(() => ({ id: "convex" }))
const crossDomainClientMock = vi.fn(() => ({ id: "cross-domain" }))
const anonymousClientMock = vi.fn(() => ({ id: "anonymous" }))

vi.mock("better-auth/react", () => ({ createAuthClient: createAuthClientMock }))
vi.mock("@convex-dev/better-auth/client/plugins", () => ({
  convexClient: convexClientPluginMock,
  crossDomainClient: crossDomainClientMock,
}))
vi.mock("better-auth/client/plugins", () => ({ anonymousClient: anonymousClientMock }))
vi.mock("../../client/convex-client", () => ({ default: {} }))
vi.mock("@convex-dev/better-auth/react", () => ({}))

describe("authClient", () => {
  beforeEach(() => {
    vi.resetModules()
    createAuthClientMock.mockReturnValue(mockAuthClient)
  })

  it("calls createAuthClient with convexClient, crossDomainClient, and anonymousClient plugins", async () => {
    await import("../../client/index")

    expect(createAuthClientMock).toHaveBeenCalledOnce()
    const [options] = createAuthClientMock.mock.calls[0]
    const pluginIds = options.plugins.map((p: { id: string }) => p.id)
    expect(pluginIds).toContain("convex")
    expect(pluginIds).toContain("cross-domain")
    expect(pluginIds).toContain("anonymous")
  })

  it("backs crossDomainClient with the cookie jar storage adapter", async () => {
    await import("../../client/index")

    expect(crossDomainClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: expect.objectContaining({
          getItem: expect.any(Function),
          setItem: expect.any(Function),
        }),
      }),
    )
  })

  it("exports createAuthClient result as default", async () => {
    const { default: authClient } = await import("../../client/index")
    expect(authClient).toBe(mockAuthClient)
  })

  it("authClient.signIn.anonymous is callable", async () => {
    const { default: authClient } = await import("../../client/index")
    expect(authClient).toHaveProperty("signIn.anonymous")
    expect(typeof (authClient as any).signIn.anonymous).toBe("function")
  })
})
