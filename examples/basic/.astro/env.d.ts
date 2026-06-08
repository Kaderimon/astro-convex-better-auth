declare module 'astro:env/client' {
	export const PUBLIC_CONVEX_SITE_URL: string | undefined;	
	export const PUBLIC_CONVEX_URL: string | undefined;	
}declare module 'astro:env/server' {
	export const SITE_URL: string | undefined;	
	export const BETTER_AUTH_SECRET: string | undefined;	
}