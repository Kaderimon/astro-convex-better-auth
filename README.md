# astro-convex-better-auth

[![npm version](https://img.shields.io/npm/v/astro-convex-better-auth)](https://www.npmjs.com/package/astro-convex-better-auth)
[![CI](https://github.com/Kaderimon/astro-convex-better-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/Kaderimon/astro-convex-better-auth/actions/workflows/ci.yml)

A thin Astro integration that wires [`@convex-dev/better-auth`](https://github.com/get-convex/better-auth) into an Astro SSR project. It provides:

- An **Astro integration** that injects env variables and a virtual config module
- An **SSR middleware** that validates sessions on every request and populates `Astro.locals`
- **Client building blocks** for your better-auth client: `cookieJarStorage` (browser cookie jar as the single session store shared with SSR) and `restoreAnonymousSessionClient`
- A **better-auth server plugin** (`restoreAnonymousSessionPlugin`) that lets expired anonymous sessions be restored transparently

---

## Prerequisites

**Packages**

```
astro-convex-better-auth
@convex-dev/better-auth
better-auth
convex
```

**Convex backend** must have Better Auth configured — typically `convex/auth.ts` and `convex/auth.config.ts`.

**Environment variables**

| Variable                 | Example                    | Description                  |
| ------------------------ | -------------------------- | ---------------------------- |
| `PUBLIC_CONVEX_URL`      | `https://xxx.convex.cloud` | Convex deployment URL        |
| `PUBLIC_CONVEX_SITE_URL` | `https://xxx.convex.site`  | Convex HTTP actions base URL |

---

## Setup

### 1. Astro integration — `astro.config.mjs`

```js
import convexBetterAuth from "astro-convex-better-auth"

export default defineConfig({
  output: "server", // or "hybrid"
  adapter: cloudflare(), // any SSR adapter
  integrations: [
    // ... other integrations
    convexBetterAuth(),
  ],
})
```

**Passing env variables** — `astro.config.*` runs before Astro resolves `.env` files, so use `process.env` or Vite's `loadEnv` instead of `import.meta.env`:

```js
import { loadEnv } from "vite"
import convexBetterAuth from "astro-convex-better-auth"

const env = loadEnv(process.env.NODE_ENV, process.cwd(), "")

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [
    convexBetterAuth({
      convexUrl: process.env.PUBLIC_CONVEX_URL || env.PUBLIC_CONVEX_URL,
      siteUrl: process.env.PUBLIC_CONVEX_SITE_URL || env.PUBLIC_CONVEX_SITE_URL,
    }),
  ],
})
```

**Optional — auto-inject the middleware** so you don't need to create `src/middleware.ts` at all:

```js
convexBetterAuth({ autoMiddleware: true })
// or with options:
convexBetterAuth({ autoMiddleware: { includeConvexToken: true } })
```

When `autoMiddleware` is set, write your own route-protection logic directly in `src/middleware.ts` using `context.locals.user` / `context.locals.session` — do **not** also call `convexBetterAuthMiddleware()` there or it will execute twice.

The integration automatically injects `App.Locals` types (`user`, `session`, `convexToken`) into your project via Astro's `injectTypes()` — no manual `src/env.d.ts` declarations needed.

### 2. Middleware — `src/middleware.ts`

```ts
import { convexBetterAuthMiddleware } from "astro-convex-better-auth/server"
import { defineMiddleware, sequence } from "astro:middleware"

const authGuard = defineMiddleware((context, next) => {
  const { pathname } = context.url
  if (pathname === "/auth" || pathname.startsWith("/api/auth")) {
    return next()
  }
  if (!context.locals.session) {
    return context.redirect("/auth")
  }
  return next()
})

export const onRequest = sequence(
  defineMiddleware(convexBetterAuthMiddleware()),
  authGuard,
)
```

`convexBetterAuthMiddleware()` runs first: it reads session cookies, validates them against the Convex backend, and sets `context.locals.user` and `context.locals.session`. Your own middleware runs after and can trust those values.

**Optional — expose a Convex JWT for server-side Convex calls:**

```ts
convexBetterAuthMiddleware({ includeConvexToken: true })
// context.locals.convexToken will be set (string | null)
```

### 3. Auth API catch-all — `src/pages/api/auth/[...all].ts`

```ts
import type { APIRoute } from "astro"
import { authHandler } from "astro-convex-better-auth/server"

export const ALL: APIRoute = ({ request }) => authHandler(request)
```

This proxies every `/api/auth/*` request (sign-in callbacks, token refresh, etc.) to the Convex backend. It must exist or auth flows will break.

---

## Usage

### Server-side (Astro components / middleware)

```astro
---
const user = Astro.locals.user
const session = Astro.locals.session

// Anonymous users have isAnonymous: true
const isAnonymous = (user as any)?.isAnonymous === true
---
```

### Create your auth client

Compose your own better-auth client with this library's building blocks — e.g. in `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react"
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins"
import { anonymousClient } from "better-auth/client/plugins"
import type { AuthClient } from "@convex-dev/better-auth/react"
import { cookieJarStorage, restoreAnonymousSessionClient } from "astro-convex-better-auth/client"
import { SESSION_UPDATE_AGE } from "astro:env/client"

const client = createAuthClient({
  baseURL: import.meta.env.PUBLIC_CONVEX_SITE_URL,
  sessionOptions: {
    // Keep an open tab's session alive: poll get-session at the updateAge
    // cadence so better-auth refreshes the session before expiresIn elapses.
    // Without this, better-auth never polls (refetchInterval defaults to 0)
    // and an idle tab's session expires at expiresIn.
    refetchInterval: SESSION_UPDATE_AGE,
  },
  plugins: [
    convexClient(),
    // cookieJarStorage makes the browser cookie jar the single session store
    // shared with the Astro SSR middleware.
    crossDomainClient({ storage: cookieJarStorage }),
    anonymousClient(),
    // Optional, for anonymous session restoration.
    // Must come after crossDomainClient() — see below.
    restoreAnonymousSessionClient(),
  ],
})

// Intersect with AuthClient so Convex helpers type-check without losing
// plugin-inferred methods such as `signIn.anonymous`.
const authClient = client as typeof client & AuthClient

export default authClient
```

**Plugin order matters**: `restoreAnonymousSessionClient()` must come *after* `crossDomainClient()` in the plugins array — better-fetch runs plugin hooks in array order, and it inspects the cookie jar expecting `crossDomainClient` to have already applied the response's cookie changes.

**Session keepalive**: better-auth only extends a session (its `updateAge` sliding window) when `get-session` is actually called, and its client never polls by default. `sessionOptions.refetchInterval` makes an open tab poll so the session is refreshed before `expiresIn` elapses. Using the server's `updateAge` as the cadence keeps one knob for both sides — expose it to the client via Astro's env schema in `astro.config.*`:

```js
import { defineConfig, envField } from "astro/config"

export default defineConfig({
  env: {
    schema: {
      // Mirror the Convex-side SESSION_UPDATE_AGE (npx convex env set …)
      SESSION_UPDATE_AGE: envField.number({
        context: "client",
        access: "public",
        default: 24 * 60 * 60,
      }),
    },
  },
  // ...
})
```

### Client-side usage (React components)

```ts
// Read current session reactively
const { data: session, isPending } = authClient.useSession()
const user = session?.user

// Sign in
await authClient.signIn.email({ email, password, callbackURL: "/" })
await authClient.signIn.social({ provider: "github", callbackURL: "/" })
await authClient.signIn.anonymous()

// Sign up
await authClient.signUp.email({ name, email, password, callbackURL: "/" })
```

> The Convex auth server (`xxx.convex.site`) is on a different origin from your Astro app, so the browser's cross-origin cookie rules block `Set-Cookie` responses from landing in your app's cookie jar. The `crossDomainClient()` plugin backed by this library's `cookieJarStorage` adapter persists the auth cookies it receives directly into `document.cookie` on your app's origin. The browser cookie jar is the single session store shared by client-side requests and the SSR middleware — no sync step or manual cookie calls are needed.

### Wrapping Convex-authenticated components

Use `ConvexBetterAuthProvider` from `@convex-dev/better-auth/react` to gate UI behind a valid Convex session. Construct the `ConvexReactClient` yourself:

```tsx
import { ConvexReactClient } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { Authenticated } from "convex/react"
import authClient from "./lib/auth-client"

const convexClient = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL, {
  expectAuth: true, // optional: pause queries until the user is authenticated
})

;<ConvexBetterAuthProvider client={convexClient} authClient={authClient}>
  <Authenticated>{/* rendered only when authenticated */}</Authenticated>
</ConvexBetterAuthProvider>
```

**Optional — skip the async client-side token fetch on first hydration:**

When `includeConvexToken: true` is set in the middleware, `context.locals.convexToken` holds a short-lived Convex JWT. Pass it as `initialToken` to `ConvexBetterAuthProvider` so the Convex client starts authenticated immediately — without waiting for the async `authClient.convex.token()` round-trip that would otherwise cause a brief unauthenticated flash:

```astro
---
// src/layouts/AuthenticatedLayout.astro
const initialToken = Astro.locals.convexToken
---

<MyReactIsland client:load initialToken={initialToken} />
```

```tsx
// MyReactIsland.tsx
import { ConvexReactClient } from "convex/react"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import authClient from "../lib/auth-client"

const convexClient = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL)

export default function MyReactIsland({ initialToken }: { initialToken?: string | null }) {
  return (
    <ConvexBetterAuthProvider
      client={convexClient}
      authClient={authClient}
      initialToken={initialToken}
    >
      {/* children render with auth already established */}
    </ConvexBetterAuthProvider>
  )
}
```

> `initialToken` is consumed only once per module lifetime. In SPA-style navigations (View Transitions), the provider maintains auth state from client-side session tracking after the first hydration.

---

## Anonymous session persistence

By default, better-auth sessions expire after 7 days. When an anonymous user's session expires, better-auth deletes the session record and `signIn.anonymous()` always creates a **new** user — the original anonymous identity is permanently lost.

This library ships a built-in mechanism to restore anonymous sessions transparently after they expire, without sending the user through `/auth`.

### How it works

Three pieces work together: `restoreAnonymousSessionPlugin()` on the Convex backend, `restoreAnonymousSessions: true` in the Astro middleware, and `restoreAnonymousSessionClient()` in your auth client.

1. `restoreAnonymousSessionPlugin()` adds a signed `restoreToken` (`<userId>.<hmac>`, signed with your better-auth secret) to the `/sign-in/anonymous` response, and exposes the restore endpoint that turns a valid token back into a session. `restoreAnonymousSessionClient()` writes the token into a long-lived browser cookie (`anon_identity`, 1-year `Max-Age`) and clears it on sign-out.
2. With `restoreAnonymousSessions: true` in `convexBetterAuthMiddleware`, when no session cookie is found but `anon_identity` is present, the middleware calls the restore endpoint, which verifies the token's signature and creates a new session for the stored user. The middleware then populates `context.locals` and sets a fresh session cookie — all before any route guard runs.
3. Because the auth client reads its session store straight from the browser cookie jar (`cookieJarStorage`), the cookie the middleware sets is immediately visible client-side — `useSession()` sees the restored session on its next fetch with no sync step, reload, or re-login.
4. If the session expires while the page is open (`get-session` starts returning null), the auth client drops the dead session cookie and `restoreAnonymousSessionClient()` calls the restore endpoint itself (rate-limited), so `useSession()` recovers in place without a reload.

Because the token is HMAC-signed server-side, knowing an anonymous user's ID is not enough to take over their account — only a client that received the original sign-in response can restore the session.

### Setup

**1. Convex backend — `convex/auth.ts`**

```ts
import { restoreAnonymousSessionPlugin } from "astro-convex-better-auth/plugins"
import { anonymous } from "better-auth/plugins"

betterAuth({
  plugins: [
    convex({ authConfig }),
    anonymous(),
    restoreAnonymousSessionPlugin(), // exposes POST /api/auth/restore-anonymous-session
  ],
})
```

**2. Astro middleware — `src/middleware.ts`**

```ts
convexBetterAuthMiddleware({ restoreAnonymousSessions: true })
```

**3. Auth client — register the client plugin**

Add `restoreAnonymousSessionClient()` to your auth client's plugins, *after* `crossDomainClient()` (see [Create your auth client](#create-your-auth-client)). Registering the plugin is the opt-in — it takes no options and stays inert unless the backend plugin is registered too.

**4. Sign in / sign out**

```ts
await authClient.signIn.anonymous()
// the anon_identity cookie is set and cookies are synced automatically

await authClient.signOut()
// the anon_identity cookie is cleared automatically
```

### Expiry configuration

To test session restoration quickly, set a short expiry on your Convex backend and rely on `updateAge` (sliding sessions) to keep active users' sessions alive:

```
npx convex env set SESSION_EXPIRES_IN 30   # 30 seconds (demo only)
npx convex env set SESSION_UPDATE_AGE 10   # slide every 10 s
```

In `convex/auth.ts`:

```ts
betterAuth({
  session: {
    expiresIn: parseInt(process.env.SESSION_EXPIRES_IN ?? String(7 * 24 * 60 * 60)),
    updateAge: parseInt(process.env.SESSION_UPDATE_AGE ?? String(24 * 60 * 60)),
  },
  // ...
})
```

Set the same `SESSION_UPDATE_AGE` in your Astro app's `.env` so the client's keepalive polling matches (see [Session keepalive](#create-your-auth-client)). Sliding refresh works on both paths: the client persists the refreshed cookie via `crossDomainClient`, and the SSR middleware propagates refreshed session cookies from `get-session` back to the browser.

---

## Examples

Three feature-tiered example apps live in [`examples/`](examples), each a complete Astro + Convex app with its own Playwright e2e suite:

| Example | Adds | Use it when |
| --- | --- | --- |
| [`examples/basic`](examples/basic) | `cookieJarStorage` + SSR middleware, email/password auth | You just want sessions shared between client and SSR |
| [`examples/anonymous`](examples/anonymous) | anonymous (guest) sign-in | You want guest users; losing the guest identity at session expiry is acceptable |
| [`examples/anonymous-restore`](examples/anonymous-restore) | the `restoreAnonymousSession*` plugins on client, middleware, and Convex | Guest identity must survive session expiry |

---

## How it works

> **Internals** — not required reading for normal use.
>
> On each SSR request the middleware reads the `better-auth.convex_jwt` and `better-auth.session_token` cookies, prefixes them with `__Secure-`, and sends them in a `Better-Auth-Cookie` header to `PUBLIC_CONVEX_SITE_URL/api/auth/get-session`. The JSON response is parsed and mapped to `context.locals.user` / `context.locals.session`. This is why `PUBLIC_CONVEX_SITE_URL` (the `.convex.site` URL, not `.convex.cloud`) is required — that endpoint is an HTTP action on the Convex backend.
>
