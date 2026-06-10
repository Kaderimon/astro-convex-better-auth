# Examples

Three feature-tiered example apps, each a complete Astro + Convex app with its own Convex backend, README, and Playwright e2e suite. Each tier builds on the previous one:

| Example | Client plugins | Convex plugins | Middleware |
| --- | --- | --- | --- |
| [`basic`](basic) | `cookieJarStorage` via `crossDomainClient` | `convex`, `crossDomain` | `convexBetterAuthMiddleware()` |
| [`anonymous`](anonymous) | + `anonymousClient()` | + `anonymous()` | `convexBetterAuthMiddleware()` |
| [`anonymous-restore`](anonymous-restore) | + `restoreAnonymousSessionClient()` | + `restoreAnonymousSessionPlugin()` | + `restoreAnonymousSessions: true` |

- **basic** — email/password auth with the browser cookie jar as the single session store shared between the client and the SSR middleware.
- **anonymous** — adds guest sign-in. When the session expires, the guest identity is gone.
- **anonymous-restore** — adds transparent restoration of expired anonymous sessions on both the server (middleware) and the client.

Each example needs its own Convex deployment — see the per-example README for setup. All examples run on `http://localhost:4321`, so run one at a time.
