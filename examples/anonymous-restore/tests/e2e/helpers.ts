export function generateTestUser() {
  const id = Date.now()
  return {
    name: `Test User ${id}`,
    email: `test-${id}@example.com`,
    password: `password-${id}`,
  }
}
