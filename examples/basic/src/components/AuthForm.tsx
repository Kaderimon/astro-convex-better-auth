import { useState } from "react"
import authClient from "astro-convex-better-auth/client"
import { syncCookiesToDocument } from "astro-convex-better-auth/client"

type Mode = "signin" | "signup"

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === "signin") {
        const { error: err } = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/",
        })
        if (err) {
          setError(err.message ?? "Sign in failed")
          return
        }
      } else {
        const { error: err } = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: "/",
        })
        if (err) {
          setError(err.message ?? "Sign up failed")
          return
        }
      }

      // Sync cross-domain cookies from localStorage → document.cookie so the
      // next SSR request's middleware can read the session.
      syncCookiesToDocument()
      window.location.href = "/"
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <button
          onClick={() => setMode("signin")}
          disabled={mode === "signin"}
          style={{ marginRight: "0.5rem" }}
        >
          Sign In
        </button>
        <button onClick={() => setMode("signup")} disabled={mode === "signup"}>
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "320px" }}>
        {mode === "signup" && (
          <div>
            <label htmlFor="name">Name</label>
            <br />
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            style={{ width: "100%" }}
          />
        </div>

        {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>
      </form>
    </div>
  )
}
