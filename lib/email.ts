export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e || e.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}
