# examples/anonymous-restore

A minimal Astro app demonstrating the full `astro-convex-better-auth` feature set: email/password and anonymous (guest) authentication, server-side session checks, **and transparent restoration of expired anonymous sessions**.

Builds on [`examples/anonymous`](../anonymous) by adding the restore plugins on all three layers:

- `restoreAnonymousSessionPlugin()` in the Convex better-auth config — signs a `restoreToken` into anonymous sign-in responses and exposes `POST /restore-anonymous-session`.
- `restoreAnonymousSessionClient()` in the auth client — stores the token in the `anon_identity` cookie and restores the session client-side when `get-session` goes null.
- `restoreAnonymousSessions: true` on the middleware — restores the session server-side before rendering, so a returning guest never bounces through `/auth`.

## What's included

| Path                             | Purpose                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/middleware.ts`              | `convexBetterAuthMiddleware` with `restoreAnonymousSessions: true` + auth guard          |
| `src/pages/auth.astro`           | Sign-in / sign-up page with a "Continue as Guest" button                                 |
| `src/pages/index.astro`          | Home page (authenticated only)                                                           |
| `src/pages/protected.astro`      | Protected page (authenticated only)                                                      |
| `src/pages/api/auth/[...all].ts` | Proxies `/api/auth/*` to Convex via `authHandler`                                        |
| `src/lib/auth-client.ts`         | The composed better-auth client (`cookieJarStorage`, anonymous + restore plugins)        |
| `src/components/AuthForm.tsx`    | React sign-in/sign-up form using the auth client                                         |
| `src/components/UserInfo.tsx`    | Displays session info and a sign-out button                                              |
| `convex/`                        | Convex backend — `anonymous()` + `restoreAnonymousSessionPlugin()` wired up              |
| `tests/e2e/`                     | Playwright tests covering auth flows and the full anonymous-restore lifecycle            |

## Prerequisites

- Node.js ≥ 18
- [pnpm](https://pnpm.io) ≥ 9
- A [Convex](https://convex.dev) account

## Setup

**1. Install dependencies from the workspace root:**

```bash
# from repo root
pnpm install
pnpm build          # build the library → dist/
```

**2. Deploy the Convex backend:**

```bash
cd examples/anonymous-restore
pnpm dlx convex dev --once
```

After deployment, `convex dev` prints your `CONVEX_DEPLOYMENT` URL. Note both:

- `https://your-deployment.convex.cloud` → `PUBLIC_CONVEX_URL`
- `https://your-deployment.convex.site` → `PUBLIC_CONVEX_SITE_URL`

**3. Set Convex environment variables:**

```bash
pnpm dlx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
pnpm dlx convex env set SITE_URL "http://localhost:4321"
```

**4. Add the remaining vars to `.env.local`:**

`convex dev` already wrote `CONVEX_URL`, `CONVEX_SITE_URL`, and `SITE_URL` into `.env.local`. Append the two public aliases and a local secret:

```env
# copy values from CONVEX_URL and CONVEX_SITE_URL that convex wrote above
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site

# local secret — only needed for Astro dev server (not the Convex backend)
BETTER_AUTH_SECRET=your-secret-here
SITE_URL=http://localhost:4321
```

## Running

```bash
# In one terminal — keep Convex in sync
pnpm convex:dev

# In another terminal — Astro dev server
pnpm dev
```

Open [http://localhost:4321](http://localhost:4321). You will be redirected to `/auth`. Sign up with email/password or click **Continue as Guest** — guest identity now survives session expiry.

## E2E tests

Install Playwright browsers once:

```bash
pnpm exec playwright install
```

Then run the tests:

```bash
pnpm test:e2e
```

Playwright must be able to reach the running dev server (`http://localhost:4321`) and the Convex backend. The tests cover:

- Unauthenticated redirect to `/auth`
- Sign-up with email/password
- Sign-in with existing credentials
- Sign-out
- Anonymous (guest) sign-in
- Anonymous session persistence across reloads within the expiry window
- Middleware restoration of an expired anonymous session (same user, fresh session)
- Client-side recovery when the session expires with the page open (no request loop)
- Restoration from the `anon_identity` cookie alone (fast path, no real wait)
- Redirect away from `/auth` when already signed in

The expiry-based tests self-skip unless the Convex deployment uses a short session lifetime. To exercise them:

```bash
pnpm dlx convex env set SESSION_EXPIRES_IN 30
pnpm dlx convex env set SESSION_UPDATE_AGE 10
```

and set `SESSION_UPDATE_AGE=10` in this example's `.env.local` so the client's keepalive polling (`sessionOptions.refetchInterval`) matches the server cadence.

## How it works

```
Browser → /api/auth/* ──────────────────────────────→ authHandler → Convex site
        → any other route → middleware (session check) → Astro page
```

`convexBetterAuthMiddleware` calls `/api/auth/get-session` on every non-auth request, populates `Astro.locals.user` and `Astro.locals.session`, and strips/re-adds `__Secure-` cookie prefixes so Better Auth's CSRF checks pass across domains.

The auth client (`src/lib/auth-client.ts`) stores the cross-domain auth cookies directly in `document.cookie` (via the `cookieJarStorage` adapter), so the next SSR request's middleware reads the same session the client holds — no sync step needed.

Anonymous session restore is a three-part flow:

1. On anonymous sign-in, `restoreAnonymousSessionPlugin()` (Convex side) signs a `restoreToken` (`<userId>.<hmac>`) into the response; `restoreAnonymousSessionClient()` stores it in the long-lived `anon_identity` cookie.
2. When the session later expires, either the middleware (`restoreAnonymousSessions: true`, on the next page load) or the client plugin (if the page is open when `get-session` goes null) POSTs the token to `/restore-anonymous-session`.
3. The Convex plugin verifies the HMAC and mints a fresh session for the same anonymous user — the guest keeps their identity without ever seeing `/auth`.
