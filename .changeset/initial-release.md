---
"astro-convex-better-auth": minor
---

First public release of the Astro ⇄ Convex ⇄ better-auth bridge:

- **Astro integration** (`createIntegration` / `convexBetterAuth`): output-mode validation, typed env schema, `virtual:@convex-better-auth/astro/config` virtual module, optional auto-injected middleware.
- **Server utilities** (`/server`): `authHandler` proxy, `getConvexToken`, and `convexBetterAuthMiddleware` with session population, sliding-session cookie propagation, and optional anonymous-session restore.
- **Client building blocks** (`/client`): `cookieJarStorage` (cookie-jar-backed session store shared with SSR), `restoreAnonymousSessionClient()`, and low-level `anon_identity` cookie helpers.
- **better-auth plugin** (`/plugins`): `restoreAnonymousSessionPlugin()` — signed restore tokens and a `POST /restore-anonymous-session` endpoint so guest identity survives session expiry.
