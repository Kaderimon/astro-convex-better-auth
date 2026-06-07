interface StoredCookie {
  value: string
  expires: string | null
}

export function getCookies(raw: string): string[] {
  let parsed: Record<string, StoredCookie> = {}
  try {
    parsed = JSON.parse(raw) as Record<string, StoredCookie>
  } catch {}
  return Object.entries(parsed)
    .filter(([, v]) => !v.expires || new Date(v.expires) >= new Date())
    .map(([k, v]) => `${k.replace("__Secure-", "")}=${v.value}`)
}

export function syncCookiesToDocument() {
  getCookies(localStorage.getItem("better-auth_cookie") ?? "").forEach((c) => {
    document.cookie = `${c}; Path=/; SameSite=Lax; Max-Age=2592000`
  })
}
