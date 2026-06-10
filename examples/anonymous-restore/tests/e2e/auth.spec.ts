import { test, expect } from "@playwright/test"
import { generateTestUser } from "./helpers"

test("unauthenticated user is redirected from / to /auth", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL("/auth")
})

test("unauthenticated user is redirected from /protected to /auth", async ({ page }) => {
  await page.goto("/protected")
  await expect(page).toHaveURL("/auth")
})

test("sign-up flow", async ({ page }) => {
  const user = generateTestUser()

  await page.goto("/auth")
  await expect(page).toHaveURL("/auth")
  await page.waitForLoadState("networkidle")

  // Switch to sign-up mode
  await page.getByRole("button", { name: "Sign Up" }).click()

  await page.getByLabel("Name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign Up" }).last().click()

  // Should redirect to home after successful sign-up
  await expect(page).toHaveURL("/", { timeout: 10_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText(user.name)
})

test("sign-in flow", async ({ page }) => {
  const user = generateTestUser()

  // First sign up so the account exists
  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Sign Up" }).click()
  await page.getByLabel("Name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign Up" }).last().click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  // Sign out
  await page.getByRole("button", { name: "Sign Out" }).click()
  await expect(page).toHaveURL("/auth", { timeout: 10_000 })

  // Now sign in
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign In" }).last().click()

  await expect(page).toHaveURL("/", { timeout: 10_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText(user.name)
})

test("sign-out redirects to /auth and protects routes", async ({ page }) => {
  const user = generateTestUser()

  // Sign up and land on home
  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Sign Up" }).click()
  await page.getByLabel("Name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign Up" }).last().click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  // Verify protected page is accessible while logged in
  await page.goto("/protected")
  await expect(page).toHaveURL("/protected")
  await expect(page.getByText(user.name)).toBeVisible()

  // Sign out
  await page.goto("/")
  await page.getByRole("button", { name: "Sign Out" }).click()
  await expect(page).toHaveURL("/auth", { timeout: 10_000 })

  // Protected page should redirect after sign-out
  await page.goto("/protected")
  await expect(page).toHaveURL("/auth")
})

test("anonymous sign-in flow", async ({ page }) => {
  await page.goto("/auth")
  await page.waitForLoadState("networkidle")

  await page.getByRole("button", { name: "Continue as Guest" }).click()

  await expect(page).toHaveURL("/", { timeout: 10_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guest")
})

test("anonymous session persists when user returns within the expiry window", async ({ page }) => {
  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  const sessionId = await page.locator("code").first().textContent()
  expect(sessionId).toBeTruthy()

  // Simulate closing and reopening the tab
  await page.reload()
  await page.waitForLoadState("networkidle")

  await expect(page).toHaveURL("/")
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guest")
  const newSessionId = await page.locator("code").first().textContent()
  expect(newSessionId).toBe(sessionId)
})

test("anonymous session is restored by middleware after SESSION_EXPIRES_IN elapses without activity", async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  const firstSessionId = await page.locator("code").first().textContent()
  const userId = await page.locator("[data-user-id]").getAttribute("data-user-id")

  // Read the actual server-side expiry so the wait is precise regardless of
  // what SESSION_EXPIRES_IN is configured to.
  const expiresAtIso = await page.locator("[data-expires-at]").getAttribute("data-expires-at")
  const expiresAt = new Date(expiresAtIso!)
  const msUntilExpiry = expiresAt.getTime() - Date.now()

  // Skip unless a short SESSION_EXPIRES_IN is configured — otherwise the wait
  // would be hours. Run: npx convex env set SESSION_EXPIRES_IN 30
  if (msUntilExpiry > 90_000) {
    test.skip(true, `Session expires in ${Math.round(msUntilExpiry / 1000)}s — set SESSION_EXPIRES_IN=30 on Convex to run this test`)
    return
  }

  // Simulate closing the tab: navigate away so the client's refetchInterval
  // polling stops and no requests reach the server (no updateAge refresh can
  // occur).
  await page.goto("about:blank")
  await page.waitForTimeout(msUntilExpiry + 3_000)

  // User "comes back" — the restoreAnonymousSessions middleware detects the
  // anon_identity cookie and creates a fresh session for the same anonymous
  // user without redirecting through /auth.
  await page.goto("http://localhost:4321/")
  await expect(page).toHaveURL("/", { timeout: 10_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guest")

  // New session token (expired one was replaced) but same anonymous user
  const restoredSessionId = await page.locator("code").first().textContent()
  expect(restoredSessionId).not.toBe(firstSessionId)
  const restoredUserId = await page.locator("[data-user-id]").getAttribute("data-user-id")
  expect(restoredUserId).toBe(userId)

  // The client-side session must also be restored: the auth client adopts the
  // middleware-set session cookie into its localStorage store, so useSession()
  // in the UserInfo island sees the session too.
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("No client-side session detected")).not.toBeVisible()
})

test("expired session with the page open does not cause a get-session request loop", async ({ page, context }) => {
  test.setTimeout(120_000)

  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })
  // Island hydrated and session resolved — the session refresh manager is live.
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 10_000 })

  const expiresAtIso = await page.locator("[data-expires-at]").getAttribute("data-expires-at")
  const msUntilExpiry = new Date(expiresAtIso!).getTime() - Date.now()
  if (msUntilExpiry > 90_000) {
    test.skip(true, `Session expires in ${Math.round(msUntilExpiry / 1000)}s — set SESSION_EXPIRES_IN=30 on Convex to run this test`)
    return
  }

  // Offline so no sliding-session refresh keeps the session alive.
  await context.setOffline(true)
  await page.waitForTimeout(msUntilExpiry + 3_000)

  let getSessionCount = 0
  page.on("request", (req) => {
    if (req.url().includes("get-session")) getSessionCount++
  })

  await context.setOffline(false)
  // Fire the refetch a real browser triggers when connectivity returns.
  await page.evaluate(() => {
    const mgr = (globalThis as Record<symbol, { setOnline(o: boolean): void } | undefined>)[
      Symbol.for("better-auth:online-manager")
    ]
    mgr?.setOnline(false)
    mgr?.setOnline(true)
  })
  await page.waitForTimeout(8_000)

  // A short settle burst is expected; the regression was an unbounded loop
  // (70+ requests in 8s) from re-adopting the rejected session token.
  expect(getSessionCount).toBeLessThan(15)

  // The client recovers in place: the plugin restores the anonymous session
  // through the auth client and useSession() shows it without a reload.
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("No client-side session detected")).not.toBeVisible()
})

test("anonymous session is restored via anon_identity cookie (fast, no real wait)", async ({ page }) => {
  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  const userId = await page.locator("[data-user-id]").getAttribute("data-user-id")
  expect(userId).toBeTruthy()

  // The cookie value is an HMAC-signed restore token, so it cannot be
  // reconstructed from the user ID — capture the real cookie before clearing.
  const anonCookie = (await page.context().cookies()).find(
    (c) => c.name === "anon_identity",
  )
  expect(anonCookie).toBeTruthy()

  // Simulate session expiry: remove all browser cookies (session_token gone)
  // then re-add only the long-lived anon_identity cookie.
  await page.context().clearCookies()
  await page.context().addCookies([{
    name: "anon_identity",
    value: anonCookie!.value,
    domain: "localhost",
    path: "/",
  }])

  // Navigate to / — restoreAnonymousSessions middleware should transparently
  // restore the anonymous session using the anon_identity cookie.
  await page.goto("http://localhost:4321/")
  await expect(page).toHaveURL("/", { timeout: 10_000 })
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guest")

  // Same anonymous user, restored
  const restoredUserId = await page.locator("[data-user-id]").getAttribute("data-user-id")
  expect(restoredUserId).toBe(userId)

  // The client-side session must also be restored via cookie → localStorage adoption.
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("No client-side session detected")).not.toBeVisible()
})

test("logged-in user visiting /auth is redirected to /", async ({ page }) => {
  const user = generateTestUser()

  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Sign Up" }).click()
  await page.getByLabel("Name").fill(user.name)
  await page.getByLabel("Email").fill(user.email)
  await page.getByLabel("Password").fill(user.password)
  await page.getByRole("button", { name: "Sign Up" }).last().click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

  // Visiting /auth while logged in should bounce back to /
  await page.goto("/auth")
  await expect(page).toHaveURL("/")
})
