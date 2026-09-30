// Store phones as +<digits>. Ten-digit numbers are assumed to be US/Canada.
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) return digits.length >= 8 ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export function formatPhone(p: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}
