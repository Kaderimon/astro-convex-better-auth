import type { APIRoute } from "astro"
import { authHandler } from "astro-convex-better-auth/server"

export const ALL: APIRoute = ({ request }) => authHandler(request)
