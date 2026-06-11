# astro-convex-better-auth

## 0.7.0

### Minor Changes

- [`b480247`](https://github.com/Kaderimon/astro-convex-better-auth/commit/b4802472caf0dec1a3787843fb031e8459a48051) Thanks [@Kaderimon](https://github.com/Kaderimon)! - Remove the need for `optimizeDeps.exclude` and survive duplicate better-auth versions
  - The `autoMiddleware` entrypoint is now a virtual module (`virtual:@convex-better-auth/middleware`) instead of a published file. No file shipped in the package imports `virtual:` or `astro:` specifiers anymore, so Vite's dependency optimizer can pre-bundle the package — consumers no longer need `optimizeDeps: { exclude: ["astro-convex-better-auth"] }` (or the `ssr.optimizeDeps` equivalent) and can delete that workaround. The internal `./server/middleware-entrypoint` subpath export was removed; `virtual:@convex-better-auth/astro/config` no longer exports the internal `middlewareOptions`.
  - `restoreAnonymousSessionClient()` now declares a structural return type instead of the `BetterAuthClientPlugin` interface. When a consumer's dependency tree resolves two `@better-auth/core` versions (e.g. 1.6.14 and 1.6.16), registering the plugin in `createAuthClient({ plugins })` no longer fails with a cross-version `BetterAuthClientPlugin`-is-not-assignable error. (Deduping `better-auth` is still recommended — see the new Troubleshooting section in the README.)

## 0.6.0

### Minor Changes

- [`d734ac7`](https://github.com/Kaderimon/astro-convex-better-auth/commit/d734ac7ac168f3f60a97ce980278a15353ceb0cb) Thanks [@Kaderimon](https://github.com/Kaderimon)! - First public release of the Astro ⇄ Convex ⇄ better-auth bridge:
  - **Astro integration** (`createIntegration` / `convexBetterAuth`): output-mode validation, typed env schema, `virtual:@convex-better-auth/astro/config` virtual module, optional auto-injected middleware.
  - **Server utilities** (`/server`): `authHandler` proxy, `getConvexToken`, and `convexBetterAuthMiddleware` with session population, sliding-session cookie propagation, and optional anonymous-session restore.
  - **Client building blocks** (`/client`): `cookieJarStorage` (cookie-jar-backed session store shared with SSR), `restoreAnonymousSessionClient()`, and low-level `anon_identity` cookie helpers.
  - **better-auth plugin** (`/plugins`): `restoreAnonymousSessionPlugin()` — signed restore tokens and a `POST /restore-anonymous-session` endpoint so guest identity survives session expiry.
