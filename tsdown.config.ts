import { defineConfig } from "tsdown"

export default defineConfig({
  entry: [
    "index.ts",
    "plugins.ts",
    "server/index.ts",
    "client/index.ts",
  ],
  format: "esm",
  dts: true,
  clean: true,
  deps: {
    neverBundle: [/^astro:/, /^virtual:/],
  },
})
