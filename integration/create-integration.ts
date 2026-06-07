import type { AstroIntegration } from "astro"
import { envField } from "astro/config"

import type {
  ConvexBetterAuthIntegrationOptions,
  ConvexBetterAuthMiddlewareOptions,
} from "../types"
import { vitePluginAstroConfig } from "./vite-plugin-astro-config"

const buildEnvVarFromOption = (valueToBeStored: unknown, envName: string) => {
  return valueToBeStored
    ? { [`import.meta.env.${envName}`]: JSON.stringify(valueToBeStored) }
    : {}
}

function resolveMiddlewareOptions(
  autoMiddleware: ConvexBetterAuthIntegrationOptions["autoMiddleware"],
): ConvexBetterAuthMiddlewareOptions | undefined {
  if (!autoMiddleware) return undefined
  if (autoMiddleware === true) return {}
  return autoMiddleware
}

function createIntegration() {
  return (options?: ConvexBetterAuthIntegrationOptions): AstroIntegration => {
    const {
      siteUrl,
      convexUrl,
      enableEnvSchema = true,
      autoMiddleware,
    } = options || {}
    const middlewareOptions = resolveMiddlewareOptions(autoMiddleware)

    return {
      name: "convex-better-auth/integration",
      hooks: {
        "astro:config:done": ({ injectTypes }) => {
          injectTypes({
            filename: "types.d.ts",
            content: `declare namespace App {
  interface Locals {
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
    convexToken?: string | null;
  }
}`,
          })
        },
        "astro:config:setup": ({ config, updateConfig, addMiddleware, logger }) => {
          if (["server", "hybrid"].includes(config.output) && !config.adapter) {
            logger.error(
              "Missing adapter, please update your Astro config to use one.",
            )
          }

          if (middlewareOptions) {
            addMiddleware({
              order: "pre",
              entrypoint:
                "astro-convex-better-auth/server/middleware-entrypoint",
            })
          }

          updateConfig({
            vite: {
              plugins: [vitePluginAstroConfig(config, middlewareOptions)],
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
