import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["examples/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "astro:middleware": path.resolve(
        "tests/__mocks__/astro-middleware.ts",
      ),
      "virtual:@convex-better-auth/astro/config": path.resolve(
        "tests/__mocks__/virtual-config.ts",
      ),
      "astro/config": path.resolve("tests/__mocks__/astro-config.ts"),
    },
  },
})
