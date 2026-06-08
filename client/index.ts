import { createAuthClient } from "better-auth/react"
import {
  convexClient as convexClientPlugin,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins"
import { anonymousClient } from "better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"

const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  plugins: [convexClientPlugin(), crossDomainClient(), anonymousClient()],
}) as unknown as AuthClient

export default authClient
export { getCookies, syncCookiesToDocument } from "./cookies"
export { default as convexClient } from "./convex-client"
