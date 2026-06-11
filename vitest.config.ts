import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["examples/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "astro/config": path.resolve("tests/__mocks__/astro-config.ts"),
    },
  },
})
