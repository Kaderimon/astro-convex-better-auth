import { createIntegration } from "./integration/create-integration"

export { createIntegration }
export { default as authClient } from "./client"
export type {
  ConvexBetterAuthLocals,
  ConvexBetterAuthMiddleware,
  ConvexBetterAuthMiddlewareOptions,
  ConvexBetterAuthNext,
  ConvexBetterAuthIntegrationOptions,
} from "./types"

export const convexBetterAuth = createIntegration()

export default convexBetterAuth
