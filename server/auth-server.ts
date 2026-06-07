import { getToken as _getToken } from "@convex-dev/better-auth/utils"

const CONVEX_SITE_URL = import.meta.env.PUBLIC_CONVEX_SITE_URL as string

export async function getConvexToken(headers: Headers) {
  const clean = new Headers(headers)
  clean.delete("content-length")
  clean.delete("transfer-encoding")
  clean.set("accept-encoding", "identity")
  const result = await _getToken(CONVEX_SITE_URL, clean)
  return result.token ?? null
}

export function authHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = `${CONVEX_SITE_URL}${url.pathname}${url.search}`
  const headers = new Headers(request.headers)
  headers.set("accept-encoding", "application/json")
  headers.set("host", new URL(CONVEX_SITE_URL).host)
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
