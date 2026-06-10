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

test("anonymous session is gone after SESSION_EXPIRES_IN elapses (no restore in this example)", async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto("/auth")
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Continue as Guest" }).click()
  await expect(page).toHaveURL("/", { timeout: 10_000 })

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

  // Simulate closing the tab: navigate away so the React useSession() polling
  // stops and no requests reach the server (no updateAge refresh can occur).
  await page.goto("about:blank")
  await page.waitForTimeout(msUntilExpiry + 3_000)

  // User "comes back" — without the restore plugin the expired session cannot
  // be recovered, so the auth guard sends them to /auth. This is the gap the
  // anonymous-restore example fills.
  await page.goto("http://localhost:4321/")
  await expect(page).toHaveURL("/auth", { timeout: 10_000 })
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
