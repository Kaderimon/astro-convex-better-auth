import { createAuthClient } from "better-auth/react"
import {
  convexClient as convexClientPlugin,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import { anonymousClient } from "better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { astroConvexClient } from "./plugin"

const client = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  plugins: [
    convexClientPlugin(),
    crossDomainClient(),
    anonymousClient(),
    // Must come after crossDomainClient() — see the astroConvexClient docs.
    astroConvexClient({ restoreAnonymousSessions: true }),
  ],
})

// Intersect with AuthClient so Convex helpers type-check without losing
// plugin-inferred methods such as `signIn.anonymous`.
const authClient = client as typeof client & AuthClient

export default authClient
export { getCookies, syncCookiesToDocument, setAnonIdentityCookie, clearAnonIdentityCookie } from "./cookies"
export { astroConvexClient, type AstroConvexClientOptions } from "./plugin"
export { default as convexClient } from "./convex-client"
