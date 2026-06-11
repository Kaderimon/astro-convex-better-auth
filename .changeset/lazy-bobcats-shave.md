---
"astro-convex-better-auth": minor
---

Remove the need for `optimizeDeps.exclude` and survive duplicate better-auth versions

- The `autoMiddleware` entrypoint is now a virtual module (`virtual:@convex-better-auth/middleware`) instead of a published file. No file shipped in the package imports `virtual:` or `astro:` specifiers anymore, so Vite's dependency optimizer can pre-bundle the package — consumers no longer need `optimizeDeps: { exclude: ["astro-convex-better-auth"] }` (or the `ssr.optimizeDeps` equivalent) and can delete that workaround. The internal `./server/middleware-entrypoint` subpath export was removed; `virtual:@convex-better-auth/astro/config` no longer exports the internal `middlewareOptions`.
- `restoreAnonymousSessionClient()` now declares a structural return type instead of the `BetterAuthClientPlugin` interface. When a consumer's dependency tree resolves two `@better-auth/core` versions (e.g. 1.6.14 and 1.6.16), registering the plugin in `createAuthClient({ plugins })` no longer fails with a cross-version `BetterAuthClientPlugin`-is-not-assignable error. (Deduping `better-auth` is still recommended — see the new Troubleshooting section in the README.)
