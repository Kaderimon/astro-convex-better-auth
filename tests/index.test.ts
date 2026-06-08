import { describe, expect, it } from "vitest"
import * as rootExports from "../index"

describe("root package exports", () => {
  it("exports createIntegration", () => {
    expect(typeof rootExports.createIntegration).toBe("function")
  })

  it("exports convexBetterAuth as a callable factory", () => {
    expect(typeof rootExports.convexBetterAuth).toBe("function")
  })

  it("does not export authClient (prevents import.meta.env crash in Node.js at config load time)", () => {
    expect(rootExports).not.toHaveProperty("authClient")
  })
})
