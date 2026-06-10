import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"
import { constantTimeEqual, makeSignature } from "better-auth/crypto"
import { z } from "zod"
import { RESTORE_ANONYMOUS_SESSION_PATH } from "../shared/constants"

/**
 * Better Auth plugin that adds a `POST /restore-anonymous-session` endpoint.
 *
 * When an anonymous session expires, the user record stays in the database but
 * becomes unreachable. This endpoint creates a fresh session for an existing
 * anonymous user given a signed restore token, enabling the Astro middleware to
 * transparently restore the session without sending the user through /auth.
 *
 * The token is minted by this plugin's after-hook on `/sign-in/anonymous`: the
 * response gains a `restoreToken` field of the form `<userId>.<hmac>`, signed
 * with the better-auth secret. The restore endpoint verifies the signature
 * before creating a session, so knowing a user ID alone is not enough to take
 * over an anonymous account.
 *
 * Register this alongside the `anonymous()` plugin in your Convex auth config:
 *
 * ```ts
 * import { restoreAnonymousPlugin } from "astro-convex-better-auth/plugins"
 *
 * betterAuth({
 *   plugins: [convex({ authConfig }), anonymous(), restoreAnonymousPlugin()],
 * })
 * ```
 *
 * Pair with `restoreAnonymousSessions: true` in `convexBetterAuthMiddleware()`.
 * The pre-configured auth client stores the token in the `anon_identity`
 * cookie automatically after anonymous sign-in.
 */
export const restoreAnonymousPlugin = () => ({
  id: "restore-anonymous",
  hooks: {
    after: [
      {
        matcher: (ctx: { path?: string }) => ctx.path === "/sign-in/anonymous",
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned
          if (!returned || returned instanceof Response) return
          const userId = (returned as { user?: { id?: string } }).user?.id
          if (!userId) return
          const signature = await makeSignature(userId, ctx.context.secret)
          return ctx.json({
            ...(returned as Record<string, unknown>),
            restoreToken: `${userId}.${signature}`,
          })
        }),
      },
    ],
  },
  endpoints: {
    restoreAnonymousSession: createAuthEndpoint(
      RESTORE_ANONYMOUS_SESSION_PATH,
      { method: "POST", body: z.object({ token: z.string() }) },
      async (ctx) => {
        const dotIdx = ctx.body.token.lastIndexOf(".")
        if (dotIdx === -1) {
          throw new APIError("UNAUTHORIZED", { message: "malformed restore token" })
        }
        const userId = ctx.body.token.slice(0, dotIdx)
        const signature = ctx.body.token.slice(dotIdx + 1)
        const expected = await makeSignature(userId, ctx.context.secret)
        if (!constantTimeEqual(signature, expected)) {
          throw new APIError("UNAUTHORIZED", { message: "invalid restore token" })
        }

        const user = await ctx.context.internalAdapter.findUserById(userId)
        if (!user) {
          throw new APIError("NOT_FOUND", { message: "user not found" })
        }
        if (!(user as { isAnonymous?: boolean }).isAnonymous) {
          throw new APIError("BAD_REQUEST", { message: "not an anonymous user" })
        }

        const session = await ctx.context.internalAdapter.createSession(user.id)
        if (!session) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "could not create session" })
        }

        await setSessionCookie(ctx, { session, user }, false)
        // sessionToken must be the signed cookie value (`<token>.<hmac>`) —
        // better-auth rejects unsigned session cookies, so returning the raw
        // token would make every later get-session (SSR and client) fail.
        const signedSessionToken = `${session.token}.${await makeSignature(
          session.token,
          ctx.context.secret,
        )}`
        // Session and user are included so the Astro middleware can populate
        // context.locals without an additional get-session round-trip.
        return ctx.json({ sessionToken: signedSessionToken, user, session })
      },
    ),
  },
})
