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
