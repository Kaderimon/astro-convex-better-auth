import authClient from "astro-convex-better-auth/client"

export default function UserInfo() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <p>Loading session...</p>
  }

  if (!session) {
    return <p style={{ color: "gray" }}>No client-side session detected.</p>
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    window.location.href = "/auth"
  }

  return (
    <div>
      <p>
        Signed in as <strong>{session.user.name}</strong> ({session.user.email})
      </p>
      <button onClick={handleSignOut}>Sign Out</button>
    </div>
  )
}
