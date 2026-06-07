import { createRemoteJWKSet, jwtVerify } from "jose"

// Module-level cache: one RemoteJWKSet per site URL (handles its own key caching internally)
const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(convexSiteUrl: string) {
  if (!jwksSets.has(convexSiteUrl)) {
    jwksSets.set(
      convexSiteUrl,
      createRemoteJWKSet(new URL(`${convexSiteUrl}/api/auth/convex/jwks`)),
    )
  }
  return jwksSets.get(convexSiteUrl)!
}

export async function verifyConvexJwt(
  token: string,
  convexSiteUrl: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(convexSiteUrl), {
      audience: "convex",
      issuer: convexSiteUrl,
    })
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}
