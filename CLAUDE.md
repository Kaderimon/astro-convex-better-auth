# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`astro-convex-better-auth` is a TypeScript library (Astro integration) that bridges [Convex](https://convex.dev) and [better-auth](https://www.better-auth.com) inside Astro projects. It is a package to be published and consumed, not an application.

## Commands

```bash
pnpm build   # bundle with tsdown → dist/
pnpm test    # no-op placeholder
```

## Architecture

The library has three layers that consumers use together:

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
  - Populates `context.locals.user`, `context.locals.session`, and optionally `context.locals.convexToken`.

Cookies forwarded to Convex: `better-auth.convex_jwt` and `better-auth.session_token` (re-prefixed as `__Secure-*`).

### 3. Client (`client/index.ts`)

Pre-configured `better-auth` React client using `convexClient()`, `crossDomainClient()`, and `anonymousClient()` plugins. Reads `PUBLIC_CONVEX_SITE_URL` as `baseURL`.

### Public surface (`index.ts`)

Exports `createIntegration`, `convexBetterAuth` (a ready-made default instance), `authClient`, and all TypeScript types from `types.ts`.

## Environment variables

| Variable | Context | Purpose |
|---|---|---|
| `PUBLIC_CONVEX_SITE_URL` | client + server | Convex HTTP actions URL (used as auth proxy target) |
| `PUBLIC_CONVEX_URL` | client + server | Convex deployment URL |
| `SITE_URL` | server only | Astro site URL |
| `BETTER_AUTH_SECRET` | server only | better-auth secret |
