import { getToken as _getToken } from "@convex-dev/better-auth/utils"
import { getConvexSiteUrl } from "./env"

export async function getConvexToken(headers: Headers) {
  const siteUrl = getConvexSiteUrl()
  const clean = new Headers(headers)
  clean.delete("content-length")
  clean.delete("transfer-encoding")
  clean.set("accept-encoding", "identity")
  const result = await _getToken(siteUrl, clean, {
    jwtCache: { enabled: true, isAuthError: () => false },
  })
  return result.token ?? null
}

export function authHandler(request: Request): Promise<Response> {
  const siteUrl = getConvexSiteUrl()
  const url = new URL(request.url)
  const target = `${siteUrl}${url.pathname}${url.search}`
  const headers = new Headers(request.headers)
  headers.set("accept-encoding", "identity")
  headers.set("host", new URL(siteUrl).host)
  headers.set("x-forwarded-host", url.host)
  headers.set("x-forwarded-proto", url.protocol.replace(/:$/, ""))
  headers.set("x-better-auth-forwarded-host", url.host)
  headers.set("x-better-auth-forwarded-proto", url.protocol.replace(/:$/, ""))

  return fetch(target, {
    method: request.method,
    headers,
    redirect: "manual",
    body: request.body,
    // @ts-ignore Required for streaming request bodies in Cloudflare Workers.
    duplex: "half",
  })
}
