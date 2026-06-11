import { describe, expect, it } from "vitest"
import { vitePluginAstroConfig } from "../../integration/vite-plugin-astro-config"

function makePlugin(output: string, middlewareOptions?: Record<string, unknown>) {
  return vitePluginAstroConfig({ output } as never, middlewareOptions as never)
}

const VIRTUAL_ID = "virtual:@convex-better-auth/astro/config"
const RESOLVED_ID = "\0" + VIRTUAL_ID
const MIDDLEWARE_VIRTUAL_ID = "virtual:@convex-better-auth/middleware"
const RESOLVED_MIDDLEWARE_ID = "\0" + MIDDLEWARE_VIRTUAL_ID

function getIsStaticOutput(output: string, forceStatic?: boolean): boolean {
  const plugin = makePlugin(output)
  const load = plugin.load as (id: string) => string | undefined
  const code = load(RESOLVED_ID)!

  // Strip ESM export keywords so new Function() can execute the module code
  const stripped = code
    .replace(/export const /g, "const ")
    .replace(/export function /g, "function ")

  const fn = new Function(
    "forceStatic",
    `
    ${stripped}
    return isStaticOutput(forceStatic);
    `,
  )
  return fn(forceStatic)
}

describe("vitePluginAstroConfig", () => {
  it("has the correct plugin name", () => {
    const plugin = makePlugin("server")
    expect(plugin.name).toBe("vite-plugin-convex-better-auth-astro-config")
  })

  describe("resolveId", () => {
    it("resolves the virtual module id to the prefixed internal id", () => {
      const plugin = makePlugin("server")
      const resolveId = plugin.resolveId as (id: string) => string | undefined

      expect(resolveId(VIRTUAL_ID)).toBe(RESOLVED_ID)
    })

    it("resolves the virtual middleware module id to the prefixed internal id", () => {
      const plugin = makePlugin("server")
      const resolveId = plugin.resolveId as (id: string) => string | undefined

      expect(resolveId(MIDDLEWARE_VIRTUAL_ID)).toBe(RESOLVED_MIDDLEWARE_ID)
    })

    it("returns undefined for unrecognized module ids", () => {
      const plugin = makePlugin("server")
      const resolveId = plugin.resolveId as (id: string) => string | undefined

      expect(resolveId("some-other-module")).toBeUndefined()
    })
  })

  describe("load", () => {
    it("returns undefined for unrecognized ids", () => {
      const plugin = makePlugin("server")
      const load = plugin.load as (id: string) => string | undefined

      expect(load("unrelated-id")).toBeUndefined()
    })

    it("returns a string for the resolved virtual module id", () => {
      const plugin = makePlugin("server")
      const load = plugin.load as (id: string) => string | undefined

      expect(typeof load(RESOLVED_ID)).toBe("string")
    })

    it("does not embed middlewareOptions in the config module", () => {
      const opts = { includeConvexToken: true, restoreAnonymousSessions: false }
      const plugin = makePlugin("server", opts)
      const load = plugin.load as (id: string) => string | undefined

      const code = load(RESOLVED_ID)!

      expect(code).not.toContain("middlewareOptions")
    })

    describe("virtual middleware module", () => {
      it("serializes middlewareOptions into the module string", () => {
        const opts = { includeConvexToken: true, restoreAnonymousSessions: false }
        const plugin = makePlugin("server", opts)
        const load = plugin.load as (id: string) => string | undefined

        const code = load(RESOLVED_MIDDLEWARE_ID)!

        expect(code).toContain(JSON.stringify(opts))
      })

      it("defaults to empty options when middlewareOptions is undefined", () => {
        const plugin = makePlugin("server", undefined)
        const load = plugin.load as (id: string) => string | undefined

        const code = load(RESOLVED_MIDDLEWARE_ID)!

        expect(code).toContain("convexBetterAuthMiddleware({})")
      })

      it("imports the middleware from the package's server entry and exports onRequest", () => {
        const plugin = makePlugin("server")
        const load = plugin.load as (id: string) => string | undefined

        const code = load(RESOLVED_MIDDLEWARE_ID)!

        expect(code).toContain('from "astro-convex-better-auth/server"')
        expect(code).toContain("export const onRequest")
        // Keep the module free of specifiers the dep optimizer can't resolve.
        expect(code).not.toContain("astro:middleware")
        expect(code).not.toContain("virtual:")
      })
    })

    describe("isStaticOutput logic", () => {
      it("returns true for 'hybrid' output with no forceStatic arg", () => {
        expect(getIsStaticOutput("hybrid", undefined)).toBe(true)
      })

      it("returns false for 'server' output with no forceStatic arg", () => {
        expect(getIsStaticOutput("server", undefined)).toBe(false)
      })

      it("returns true for 'static' output with no forceStatic arg", () => {
        expect(getIsStaticOutput("static", undefined)).toBe(true)
      })

      it("forceStatic=true overrides output mode (returns true regardless)", () => {
        expect(getIsStaticOutput("server", true)).toBe(true)
        expect(getIsStaticOutput("hybrid", true)).toBe(true)
      })

      it("forceStatic=false overrides output mode (returns false regardless)", () => {
        expect(getIsStaticOutput("static", false)).toBe(false)
        expect(getIsStaticOutput("hybrid", false)).toBe(false)
      })
    })
  })
})
