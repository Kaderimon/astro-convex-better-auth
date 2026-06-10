import { httpRouter } from "convex/server"
import { authComponent, createAuth } from "./auth"

const http = httpRouter()

// Register all /api/auth/* routes to the Better Auth handler.
// cors: true is required because the Astro app and Convex site are different origins.
authComponent.registerRoutes(http, createAuth, { cors: true })

export default http
