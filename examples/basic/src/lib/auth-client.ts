import { createAuthClient } from "better-auth/react"
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { cookieJarStorage } from "astro-convex-better-auth/client"
import { SESSION_UPDATE_AGE } from "astro:env/client"

const client = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  sessionOptions: {
    // Keep an open tab's session alive: poll get-session at the updateAge
    // cadence so better-auth refreshes the session before expiresIn elapses.
    refetchInterval: SESSION_UPDATE_AGE,
  },
  plugins: [
    convexClient(),
    // cookieJarStorage makes the browser cookie jar the single session store
    // shared with the Astro SSR middleware.
    crossDomainClient({ storage: cookieJarStorage }),
  ],
})

// Intersect with AuthClient so Convex helpers type-check without losing
// plugin-inferred methods.
const authClient = client as typeof client & AuthClient

export default authClient
