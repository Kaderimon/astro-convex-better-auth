import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config"
import type { AuthConfig } from "convex/server"

// Configures Convex to verify JWTs issued by Better Auth.
// CONVEX_SITE_URL is set automatically by the Convex runtime.
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig
