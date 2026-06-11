import type { AstroConfig } from "astro"
import type { ConvexBetterAuthMiddlewareOptions } from "../types"

type VitePlugin = Required<AstroConfig["vite"]>["plugins"][number]

export function vitePluginAstroConfig(
  astroConfig: AstroConfig,
  middlewareOptions?: ConvexBetterAuthMiddlewareOptions,
): VitePlugin {
  const virtualModuleId = "virtual:@convex-better-auth/astro/config"
  const resolvedVirtualModuleId = "\0" + virtualModuleId
  const middlewareModuleId = "virtual:@convex-better-auth/middleware"
  const resolvedMiddlewareModuleId = "\0" + middlewareModuleId

  return {
    name: "vite-plugin-convex-better-auth-astro-config",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      if (id === middlewareModuleId) {
        return resolvedMiddlewareModuleId
      }
    },
    load(id) {
      // The auto-injected middleware entrypoint is a virtual module rather
      // than a published file: a file inside the package would be pre-bundled
      // by Vite's dep optimizer with plain esbuild (no Vite plugins), which
      // cannot resolve virtual imports — consumers would have to exclude the
      // package from optimizeDeps. Serving it virtually keeps every published
      // file free of virtual:/astro: imports.
      if (id === resolvedMiddlewareModuleId) {
        return `
          import { convexBetterAuthMiddleware } from "astro-convex-better-auth/server";
          export const onRequest = convexBetterAuthMiddleware(${JSON.stringify(middlewareOptions ?? {})});
        `
      }
      if (id === resolvedVirtualModuleId) {
        return `
          const configOutput = '${astroConfig.output}';

          export function isStaticOutput(forceStatic) {
            if (configOutput === 'hybrid' && forceStatic === undefined) {
              return true;
            }

            if (forceStatic !== undefined) {
              return forceStatic;
            }

            return configOutput === 'static';
          }
        `
      }
    },
  }
}
