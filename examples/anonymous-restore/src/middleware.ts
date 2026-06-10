import { convexBetterAuthMiddleware } from "astro-convex-better-auth/server"
import { defineMiddleware, sequence } from "astro:middleware"

const PUBLIC_PATHS = new Set(["/auth"])

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

export const onRequest = sequence(
  defineMiddleware(convexBetterAuthMiddleware({ restoreAnonymousSessions: true })),
  authGuard,
)
