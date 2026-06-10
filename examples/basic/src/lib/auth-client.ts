import { createAuthClient } from "better-auth/react"
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import { anonymousClient } from "better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import {
  cookieJarStorage,
  restoreAnonymousSessionClient,
} from "astro-convex-better-auth/client"

const client = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    // cookieJarStorage makes the browser cookie jar the single session store
    // shared with the Astro SSR middleware.
    crossDomainClient({ storage: cookieJarStorage }),
    anonymousClient(),
    // Must come after crossDomainClient() — see its docs.
    restoreAnonymousSessionClient(),
  ],
})

// Intersect with AuthClient so Convex helpers type-check without losing
// plugin-inferred methods such as `signIn.anonymous`.
const authClient = client as typeof client & AuthClient

export default authClient
