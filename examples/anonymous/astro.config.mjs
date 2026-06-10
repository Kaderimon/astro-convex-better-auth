import { defineConfig, envField } from "astro/config"
import node from "@astrojs/node"
import react from "@astrojs/react"
import convexBetterAuth from "astro-convex-better-auth"

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  env: {
    schema: {
      // Mirrors the Convex-side SESSION_UPDATE_AGE (npx convex env set
      // SESSION_UPDATE_AGE …) so the auth client can poll get-session at the
      // same cadence and keep an open tab's session alive.
      SESSION_UPDATE_AGE: envField.number({
        context: "client",
        access: "public",
        default: 24 * 60 * 60,
      }),
    },
  },
  integrations: [
    react(),
    convexBetterAuth({
      siteUrl: process.env.CONVEX_SITE_URL,
      convexUrl: process.env.CONVEX_URL,
    }),
  ],
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client"],
    },
  },
})
