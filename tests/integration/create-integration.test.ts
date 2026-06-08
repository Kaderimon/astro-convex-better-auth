import { beforeEach, describe, expect, it, vi } from "vitest"
import { createIntegration } from "../../integration/create-integration"

type SetupHookContext = {
  config: {
    output: string
    adapter?: unknown
  }
  updateConfig: ReturnType<typeof vi.fn>
  addMiddleware: ReturnType<typeof vi.fn>
  logger: { error: ReturnType<typeof vi.fn> }
}

function makeSetupContext(
  overrides: Partial<SetupHookContext["config"]> = {},
): SetupHookContext {
  return {
    config: { output: "server", adapter: {}, ...overrides },
    updateConfig: vi.fn(),
    addMiddleware: vi.fn(),
    logger: { error: vi.fn() },
  }
}

function runSetupHook(
  integration: ReturnType<ReturnType<typeof createIntegration>>,
  ctx: SetupHookContext,
) {
  const hook = integration.hooks?.["astro:config:setup"]
  if (typeof hook !== "function") throw new Error("Hook not found")
  hook(ctx as never)
}

describe("createIntegration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("integration metadata", () => {
    it("has the correct integration name", () => {
      const integration = createIntegration()()
      expect(integration.name).toBe("convex-better-auth/integration")
    })
  })

  describe("adapter validation", () => {
    it("calls logger.error when output is 'server' and adapter is missing", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext({ output: "server", adapter: undefined })

      runSetupHook(integration, ctx)

      expect(ctx.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("Missing adapter"),
      )
    })

    it("calls logger.error when output is 'hybrid' and adapter is missing", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext({ output: "hybrid", adapter: undefined })

      runSetupHook(integration, ctx)

      expect(ctx.logger.error).toHaveBeenCalled()
    })

    it("does not call logger.error when adapter is present", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext({ output: "server", adapter: { name: "vercel" } })

      runSetupHook(integration, ctx)

      expect(ctx.logger.error).not.toHaveBeenCalled()
    })

    it("does not call logger.error for static output without adapter", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext({ output: "static", adapter: undefined })

      runSetupHook(integration, ctx)

      expect(ctx.logger.error).not.toHaveBeenCalled()
    })
  })

  describe("autoMiddleware option", () => {
    it("does not call addMiddleware when autoMiddleware is not set", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      expect(ctx.addMiddleware).not.toHaveBeenCalled()
    })

    it("does not call addMiddleware when autoMiddleware is false", () => {
      const integration = createIntegration()({ autoMiddleware: false })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      expect(ctx.addMiddleware).not.toHaveBeenCalled()
    })

    it("calls addMiddleware with order='pre' when autoMiddleware is true", () => {
      const integration = createIntegration()({ autoMiddleware: true })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      expect(ctx.addMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({ order: "pre" }),
      )
    })

    it("calls addMiddleware when autoMiddleware is an options object", () => {
      const integration = createIntegration()({
        autoMiddleware: { includeConvexToken: true },
      })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      expect(ctx.addMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({ order: "pre" }),
      )
    })
  })

  describe("vite define entries (buildEnvVarFromOption)", () => {
    it("includes PUBLIC_CONVEX_SITE_URL define when siteUrl is provided", () => {
      const integration = createIntegration()({ siteUrl: "https://site.example.com" })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).toHaveProperty(
        "import.meta.env.PUBLIC_CONVEX_SITE_URL",
        JSON.stringify("https://site.example.com"),
      )
    })

    it("includes PUBLIC_CONVEX_URL define when convexUrl is provided", () => {
      const integration = createIntegration()({ convexUrl: "https://convex.example.com" })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).toHaveProperty(
        "import.meta.env.PUBLIC_CONVEX_URL",
        JSON.stringify("https://convex.example.com"),
      )
    })

    it("omits define entries when neither siteUrl nor convexUrl is set", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).not.toHaveProperty("import.meta.env.PUBLIC_CONVEX_SITE_URL")
      expect(define).not.toHaveProperty("import.meta.env.PUBLIC_CONVEX_URL")
    })

    it("injects define when convexUrl is a process.env-style string value", () => {
      const integration = createIntegration()({ convexUrl: "https://from-env.example.com" })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).toHaveProperty(
        "import.meta.env.PUBLIC_CONVEX_URL",
        JSON.stringify("https://from-env.example.com"),
      )
    })

    it("injects define when siteUrl is a process.env-style string value", () => {
      const integration = createIntegration()({ siteUrl: "https://from-env.site.example.com" })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).toHaveProperty(
        "import.meta.env.PUBLIC_CONVEX_SITE_URL",
        JSON.stringify("https://from-env.site.example.com"),
      )
    })

    it("omits define when convexUrl is undefined (env var not set in process.env)", () => {
      const integration = createIntegration()({ convexUrl: undefined })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).not.toHaveProperty("import.meta.env.PUBLIC_CONVEX_URL")
    })

    it("omits define when siteUrl is undefined (env var not set in process.env)", () => {
      const integration = createIntegration()({ siteUrl: undefined })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { define } = ctx.updateConfig.mock.calls[0][0].vite
      expect(define).not.toHaveProperty("import.meta.env.PUBLIC_CONVEX_SITE_URL")
    })
  })

  describe("env schema (createEnvSchema)", () => {
    it("includes all four env vars in schema when enableEnvSchema=true (default)", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { env } = ctx.updateConfig.mock.calls[0][0]
      expect(env.schema).toHaveProperty("PUBLIC_CONVEX_SITE_URL")
      expect(env.schema).toHaveProperty("PUBLIC_CONVEX_URL")
      expect(env.schema).toHaveProperty("SITE_URL")
      expect(env.schema).toHaveProperty("BETTER_AUTH_SECRET")
    })

    it("passes empty schema when enableEnvSchema=false", () => {
      const integration = createIntegration()({ enableEnvSchema: false })
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { env } = ctx.updateConfig.mock.calls[0][0]
      expect(env.schema).toEqual({})
    })
  })

  describe("Vite plugin registration", () => {
    it("registers a vite plugin via updateConfig", () => {
      const integration = createIntegration()()
      const ctx = makeSetupContext()

      runSetupHook(integration, ctx)

      const { plugins } = ctx.updateConfig.mock.calls[0][0].vite
      expect(Array.isArray(plugins)).toBe(true)
      expect(plugins.length).toBeGreaterThan(0)
      expect(plugins[0]).toHaveProperty("name", "vite-plugin-convex-better-auth-astro-config")
    })
  })
})
