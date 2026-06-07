import type { AstroConfig } from "astro"

type VitePlugin = Required<AstroConfig["vite"]>["plugins"][number]

export function vitePluginAstroConfig(astroConfig: AstroConfig): VitePlugin {
  const virtualModuleId = "virtual:@convex-better-auth/astro/config"
  const resolvedVirtualModuleId = "\0" + virtualModuleId

  return {
    name: "vite-plugin-convex-better-auth-astro-config",
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
    },
    load(id) {
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
