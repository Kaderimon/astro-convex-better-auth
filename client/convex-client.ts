import { ConvexReactClient } from "convex/react"

const convexClient = new ConvexReactClient(
  import.meta.env.PUBLIC_CONVEX_URL as string,
  {
    // Optionally pause queries until the user is authenticated
    expectAuth: true,
  },
)

export default convexClient
