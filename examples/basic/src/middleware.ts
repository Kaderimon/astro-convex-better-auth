import { defineMiddleware } from "astro:middleware"

const PUBLIC_PATHS = new Set(["/auth"])

// convexBetterAuthMiddleware runs before this guard — it is injected by the
// integration's `autoMiddleware: true` (order: "pre"), so context.locals is
// already populated here.
const authGuard = defineMiddleware((context, next) => {
  const { pathname } = context.url

  if (pathname.startsWith("/api/auth")) {
    return next()
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (context.locals.session) {
      return context.redirect("/")
    }
    return next()
  }

  if (!context.locals.session) {
    return context.redirect("/auth")
  }

  return next()
})

export const onRequest = authGuard
