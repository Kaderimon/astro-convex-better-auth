# Contributing

## Development

```bash
pnpm install
pnpm test            # vitest suite
pnpm build           # tsdown → dist/
pnpm example:build   # build the library, then all examples/*
```

Each example has its own Playwright e2e suite (needs a configured Convex backend,
see `examples/*/.env.example`):

```bash
pnpm --filter examples-basic test:e2e
```

## Releasing

Releases are managed with [Changesets](https://github.com/changesets/changesets) and
published from CI via [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC — no npm tokens).

1. With every user-facing change, add a changeset in the same PR:

   ```bash
   pnpm changeset
   ```

   Pick the bump type (patch/minor/major) and describe the change — this text becomes
   the CHANGELOG entry.

2. When changesets land on `master`, the release workflow
   (`.github/workflows/release.yml`) maintains a **"Version Packages"** PR that bumps
   the version and updates `CHANGELOG.md`.

3. Merging that PR publishes to npm (with provenance) and creates the git tag +
   GitHub Release automatically.

### CI

`.github/workflows/ci.yml` runs on every PR and push to `master`:

- `test` — vitest + tsdown build.
- `e2e` — Playwright suites for the three examples, run sequentially against one
  shared cloud Convex dev deployment: each example's functions are pushed with
  `npx convex dev --once` right before its suite runs. Workflow runs are serialized
  via a concurrency group (shared backend); fork PRs skip this job because it needs
  repository secrets.

### One-time repository setup

These were configured once and are listed here for reference:

- **npm**: the first publish was done manually (`npm publish`) to create the package,
  then a *Trusted Publisher* was added on npmjs.com (GitHub repo
  `Kaderimon/astro-convex-better-auth`, workflow `release.yml`).
- **GitHub → Settings → Actions → General**: "Allow GitHub Actions to create and
  approve pull requests" is enabled (required by `changesets/action`).
- **Secrets**: `BETTER_AUTH_SECRET` and `CONVEX_DEPLOY_KEY` (a deploy key for the
  shared dev deployment, generated in the Convex dashboard).
- **Variables**: `PUBLIC_CONVEX_URL` and `PUBLIC_CONVEX_SITE_URL` — the shared
  deployment's URLs.
