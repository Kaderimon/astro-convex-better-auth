export function getConvexSiteUrl(): string {
  const url = import.meta.env.PUBLIC_CONVEX_SITE_URL
  if (!url) {
    throw new Error(
      "[astro-convex-better-auth] PUBLIC_CONVEX_SITE_URL is not set. " +
        "Add it to your environment variables or pass siteUrl to the integration.",
    )
  }
  return url
}
