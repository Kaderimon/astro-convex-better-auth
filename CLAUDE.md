# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`astro-convex-better-auth` is a TypeScript library (Astro integration) that bridges [Convex](https://convex.dev) and [better-auth](https://www.better-auth.com) inside Astro projects. It is a package to be published and consumed, not an application.

## Commands

```bash
pnpm build           # bundle with tsdown → dist/
pnpm test            # vitest suite (tests/)
pnpm test:watch      # vitest in watch mode
pnpm test:coverage   # vitest with v8 coverage
pnpm example:build   # build the library, then examples/basic
```

## Architecture

The library has four layers that consumers use together:

### 1. Astro Integration (`integration/`)

`createIntegration` returns a factory for an `AstroIntegration`. When registered in `astro.config.*`:
- Validates that server/hybrid output modes have an adapter configured.
- Injects `PUBLIC_CONVEX_SITE_URL` and `PUBLIC_CONVEX_URL` into Vite's `define` if passed as options (overrides).
- Registers Astro's typed env schema for four env vars (can be disabled via `enableEnvSchema: false`).
- Adds a Vite plugin (`vitePluginAstroConfig`) that exposes the virtual module `virtual:@convex-better-auth/astro/config`.

The virtual module exports `isStaticOutput(forceStatic?)`, which lets server-side code check the Astro output mode at runtime without importing Astro config directly.

### 2. Server utilities (`server/`)

- **`authHandler`** — proxies any request to the Convex site URL, forwarding host and protocol headers so better-auth's CSRF checks pass. Used to forward `/api/auth/*` traffic.
- **`getConvexToken`** — fetches a short-lived Convex JWT from the Convex site using `@convex-dev/better-auth/utils`.
- **`convexBetterAuthMiddleware`** — the main Astro middleware factory:
  - Routes `/api/auth/*` directly to `authHandler`.
  - For all other routes, strips and re-prefixes cookies with `__Secure-` before calling `/api/auth/get-session` on the Convex site.
  - Populates `context.locals.user`, `context.locals.session`, and (with `includeConvexToken: true`) `context.locals.convexToken`.
  - With `restoreAnonymousSessions: true`, restores expired anonymous sessions from the `anon_identity` cookie via the restore endpoint (see layer 4).
  - Can be auto-injected by the integration via the `autoMiddleware` option (uses `server/middleware-entrypoint.ts`).

Cookies forwarded to Convex: `better-auth.convex_jwt` and `better-auth.session_token` (re-prefixed as `__Secure-*`). Cookie names and endpoint paths shared between client and server live in `shared/constants.ts`.

### 3. Client building blocks (`client/`)

No pre-configured client is exported — consumers compose their own `createAuthClient()` (see the README recipe; `examples/basic/src/lib/auth-client.ts` is the living reference). Exports from `astro-convex-better-auth/client`:

- **`cookieJarStorage`** — storage adapter for `crossDomainClient()` that backs the auth cookie store with `document.cookie` instead of localStorage, making the browser cookie jar the single session store shared with the SSR middleware.
- **`restoreAnonymousSessionClient()`** — client plugin for anonymous session restoration: stores the signed `restoreToken` in the `anon_identity` cookie, clears it on sign-out, and calls the restore endpoint when `get-session` goes null. Takes no options (registering it is the opt-in); must come *after* `crossDomainClient()` in the plugins array.
- **`setAnonIdentityCookie` / `clearAnonIdentityCookie`** — low-level cookie helpers (only needed when handling sign-in responses manually).

### 4. better-auth server plugin (`plugins.ts` → `server/restore-anonymous-session-plugin.ts`)

`restoreAnonymousSessionPlugin()` (exported from `astro-convex-better-auth/plugins`) is registered in the consumer's Convex auth config. It signs a `restoreToken` (`<userId>.<hmac>`) into `/sign-in/anonymous` responses and exposes `POST /restore-anonymous-session`, which verifies the signature and mints a fresh session — enabling the middleware and client plugin to restore expired anonymous sessions.

### Public surface (`index.ts`)

Exports `createIntegration`, `convexBetterAuth` (a ready-made default instance, also the default export), and all TypeScript types from `types.ts`. Client building blocks come from `/client`, server utilities from `/server`, the better-auth plugin from `/plugins`.

## Environment variables

| Variable | Context | Purpose |
|---|---|---|
| `PUBLIC_CONVEX_SITE_URL` | client + server | Convex HTTP actions URL (used as auth proxy target) |
| `PUBLIC_CONVEX_URL` | client + server | Convex deployment URL |
| `SITE_URL` | server only | Astro site URL |
| `BETTER_AUTH_SECRET` | server only | better-auth secret |
