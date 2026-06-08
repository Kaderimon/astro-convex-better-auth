import { defineConfig } from "astro/config"
import node from "@astrojs/node"
import react from "@astrojs/react"
import convexBetterAuth from "astro-convex-better-auth"

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
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
