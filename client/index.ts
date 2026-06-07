import { createAuthClient } from "better-auth/react"
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import { anonymousClient } from "better-auth/client/plugins"

const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient(), anonymousClient()],
})

export default authClient
