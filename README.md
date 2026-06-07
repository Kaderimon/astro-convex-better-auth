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

### 2. Type declarations — `src/env.d.ts`

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("better-auth").User | null
    session: import("better-auth").Session | null
    convexToken?: string | null // only set when middleware is configured with includeConvexToken: true
  }
}
```

### 3. Middleware — `src/middleware.ts`

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

### 4. Auth API catch-all — `src/pages/api/auth/[...all].ts`

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

// call immediately after authClient.signIn.*
syncCookiesToDocument()
```

> `better-auth` stores cookies in `localStorage` under the key `better-auth_cookie`. `syncCookiesToDocument()` reads that value and writes each cookie to `document.cookie` so Astro middleware can pick them up on the next request.

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

---

## How it works

> **Internals** — not required reading for normal use.
>
> On each SSR request the middleware reads the `better-auth.convex_jwt` and `better-auth.session_token` cookies, prefixes them with `__Secure-`, and sends them in a `Better-Auth-Cookie` header to `PUBLIC_CONVEX_SITE_URL/api/auth/get-session`. The JSON response is parsed and mapped to `context.locals.user` / `context.locals.session`. This is why `PUBLIC_CONVEX_SITE_URL` (the `.convex.site` URL, not `.convex.cloud`) is required — that endpoint is an HTTP action on the Convex backend.
