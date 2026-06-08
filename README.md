# astro-convex-better-auth

A thin Astro integration that wires [`@convex-dev/better-auth`](https://github.com/get-convex/better-auth) into an Astro SSR project. It provides:

- An **Astro integration** that injects env variables and a virtual config module
- An **SSR middleware** that validates sessions on every request and populates `Astro.locals`
- A pre-configured **auth client** for client-side sign-in/sign-up

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

**Optional — skip the `get-session` network call using local JWT verification:**

```ts
convexBetterAuthMiddleware({ jwtFastPath: true })
```

When enabled, the middleware verifies `better-auth.convex_jwt` locally against the Convex JWKS endpoint (cached in memory) and skips the `get-session` round-trip on cache hits. Falls back to `get-session` when the JWT is missing or expired.

> **Note**: On a fast-path hit, `context.locals.user` will not contain `id` or `image` unless you override `definePayload` in your Convex backend's Better Auth configuration to include them.

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

### Client-side auth client

Import the pre-configured auth client wherever you need auth on the client:

```ts
import authClient from "astro-convex-better-auth/client"
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

**After a successful sign-in, sync cookies to the browser** so the next SSR request includes them:

```ts
import { syncCookiesToDocument } from "astro-convex-better-auth/client"

// call once immediately after authClient.signIn.* or authClient.signUp.*
syncCookiesToDocument()
```

> The Convex auth server (`xxx.convex.site`) is on a different origin from your Astro app, so the browser's cross-origin cookie rules block `Set-Cookie` responses from landing in your app's cookie jar. The `crossDomainClient()` plugin (already included in the pre-configured auth client) intercepts auth responses and stores cookies in `localStorage` instead. `syncCookiesToDocument()` reads them back out and writes them to `document.cookie`, where Astro's SSR middleware can pick them up.
>
> You only need to call `syncCookiesToDocument()` **once after sign-in** — cookies written to `document.cookie` persist across page navigations until their 30-day `Max-Age` expires or the user signs out.

### Wrapping Convex-authenticated components

Use `ConvexBetterAuthProvider` from `@convex-dev/better-auth/react` to gate UI behind a valid Convex session:

```tsx
import authClient, { convexClient } from "astro-convex-better-auth/client"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"
import { Authenticated } from "convex/react"

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
import authClient, { convexClient } from "astro-convex-better-auth/client"
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"

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

## How it works

> **Internals** — not required reading for normal use.
>
> On each SSR request the middleware reads the `better-auth.convex_jwt` and `better-auth.session_token` cookies, prefixes them with `__Secure-`, and sends them in a `Better-Auth-Cookie` header to `PUBLIC_CONVEX_SITE_URL/api/auth/get-session`. The JSON response is parsed and mapped to `context.locals.user` / `context.locals.session`. This is why `PUBLIC_CONVEX_SITE_URL` (the `.convex.site` URL, not `.convex.cloud`) is required — that endpoint is an HTTP action on the Convex backend.
>
> When `jwtFastPath: true` is set, the middleware first attempts to verify `better-auth.convex_jwt` locally using the JWKS at `PUBLIC_CONVEX_SITE_URL/api/auth/convex/jwks` (fetched once and cached in memory). A valid JWT skips the `get-session` network call entirely.
