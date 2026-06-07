import type { AstroIntegration } from "astro"
import { envField } from "astro/config"

import type { ConvexBetterAuthIntegrationOptions } from "../types"
import { vitePluginAstroConfig } from "./vite-plugin-astro-config"

const buildEnvVarFromOption = (valueToBeStored: unknown, envName: string) => {
  return valueToBeStored
    ? { [`import.meta.env.${envName}`]: JSON.stringify(valueToBeStored) }
    : {}
}

function createIntegration() {
  return (options?: ConvexBetterAuthIntegrationOptions): AstroIntegration => {
    const { siteUrl, convexUrl, enableEnvSchema = true } = options || {}

    return {
      name: "convex-better-auth/integration",
      hooks: {
        "astro:config:setup": ({ config, updateConfig, logger }) => {
          if (["server", "hybrid"].includes(config.output) && !config.adapter) {
            logger.error(
              "Missing adapter, please update your Astro config to use one.",
            )
          }

          updateConfig({
            vite: {
              plugins: [vitePluginAstroConfig(config)],
              define: {
                ...buildEnvVarFromOption(siteUrl, "PUBLIC_CONVEX_SITE_URL"),
                ...buildEnvVarFromOption(convexUrl, "PUBLIC_CONVEX_URL"),
              },
              ssr: {
                external: ["node:async_hooks"],
              },
            },
            env: {
              schema: {
                ...(enableEnvSchema ? createEnvSchema() : {}),
              },
            },
          })
        },
      },
    }
  }
}

function createEnvSchema() {
  return {
    PUBLIC_CONVEX_SITE_URL: envField.string({
      context: "client",
      access: "public",
      optional: true,
      url: true,
    }),
    PUBLIC_CONVEX_URL: envField.string({
      context: "client",
      access: "public",
      optional: true,
      url: true,
    }),
    SITE_URL: envField.string({
      context: "server",
      access: "secret",
      optional: true,
      url: true,
    }),
    BETTER_AUTH_SECRET: envField.string({
      context: "server",
      access: "secret",
      optional: true,
    }),
  }
}

export { createIntegration }
