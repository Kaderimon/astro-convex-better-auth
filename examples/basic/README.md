# examples/basic

A minimal Astro app demonstrating `astro-convex-better-auth` with email/password authentication, server-side session checks, and a protected route.

## What's included

| Path                             | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `src/middleware.ts`              | `convexBetterAuthMiddleware` + auth guard (redirects unauthenticated users to `/auth`) |
| `src/pages/auth.astro`           | Sign-in / sign-up page                                                                 |
| `src/pages/index.astro`          | Home page (authenticated only)                                                         |
| `src/pages/protected.astro`      | Protected page (authenticated only)                                                    |
| `src/pages/api/auth/[...all].ts` | Proxies `/api/auth/*` to Convex via `authHandler`                                      |
| `src/components/AuthForm.tsx`    | React sign-in/sign-up form using the pre-configured `authClient`                       |
| `src/components/UserInfo.tsx`    | Displays session info and a sign-out button                                            |
| `convex/`                        | Convex backend — `@convex-dev/better-auth` component wired up with email/password      |
| `tests/e2e/`                     | Playwright tests covering redirect, sign-up, sign-in, sign-out flows                   |

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
cd examples/basic
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

Open [http://localhost:4321](http://localhost:4321). You will be redirected to `/auth` since you are not signed in. Create an account, sign in, and you'll land on the home page with access to `/protected`.

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
- Redirect away from `/auth` when already signed in

## How it works

```
Browser → /api/auth/* ──────────────────────────────→ authHandler → Convex site
        → any other route → middleware (session check) → Astro page
```

`convexBetterAuthMiddleware` calls `/api/auth/get-session` on every non-auth request, populates `Astro.locals.user` and `Astro.locals.session`, and strips/re-adds `__Secure-` cookie prefixes so Better Auth's CSRF checks pass across domains.

The pre-configured `authClient` stores the cross-domain auth cookies directly in `document.cookie` (via the `cookieJarStorage` adapter), so the next SSR request's middleware reads the same session the client holds — no sync step needed.
