// Team formats and age-group defaults. Shared by server and client.

export const AGES = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14'] as const
export type Age = (typeof AGES)[number]

export const FORMATS = {
  '4v4': { onField: 4, keeper: false },
  '7v7': { onField: 7, keeper: true },
  '11v11': { onField: 11, keeper: true },
} as const
export type FormatKey = keyof typeof FORMATS | 'custom'
export const FORMAT_KEYS: FormatKey[] = ['4v4', '7v7', '11v11', 'custom']

export type TeamSettings = {
  format: FormatKey
  onField: number
  keeper: boolean
  periods: number
  periodMin: number
  // 0 = swap only at breaks
  subMin: number
}

// Picking an age fills in everything else; coaches change only what their league does differently.
const AGE_DEFAULTS: Record<Age, { format: keyof typeof FORMATS; periods: number; periodMin: number; subMin: number }> = {
  U6: { format: '4v4', periods: 8, periodMin: 4, subMin: 0 },
  U7: { format: '4v4', periods: 4, periodMin: 10, subMin: 5 },
  U8: { format: '4v4', periods: 4, periodMin: 12, subMin: 6 },
  U9: { format: '7v7', periods: 2, periodMin: 25, subMin: 6 },
  U10: { format: '7v7', periods: 2, periodMin: 25, subMin: 6 },
  U11: { format: '7v7', periods: 2, periodMin: 30, subMin: 8 },
  U12: { format: '7v7', periods: 2, periodMin: 30, subMin: 8 },
  U13: { format: '11v11', periods: 2, periodMin: 35, subMin: 10 },
  U14: { format: '11v11', periods: 2, periodMin: 35, subMin: 10 },
}

export function agePreset(age: Age): TeamSettings {
  const a = AGE_DEFAULTS[age]
  return { ...a, ...FORMATS[a.format] }
}

export const LIMITS = {
  onField: [3, 11],
  periods: [1, 10],
  periodMin: [2, 45],
  subMin: [0, 15],
} as const

export function isAge(v: unknown): v is Age {
  return typeof v === 'string' && (AGES as readonly string[]).includes(v)
}

export function formatLabel(t: Pick<TeamSettings, 'format' | 'onField'>) {
  return t.format === 'custom' ? `${t.onField}v${t.onField}` : t.format
}

export function settingsLine(t: TeamSettings) {
  return [
    t.keeper ? 'keeper' : 'no keeper',
    `${t.periods} × ${t.periodMin} min`,
    t.subMin ? `swap every ${t.subMin}` : 'swap at breaks',
  ].join(' · ')
}

export function periodName(periods: number, p: number) {
  if (periods === 2) return p === 1 ? '1st half' : '2nd half'
  if (periods === 4) return `Q${p}`
  if (periods === 1) return 'Game'
  return `Period ${p} of ${periods}`
}

export function breakName(periods: number) {
  return periods === 2 ? 'Halftime' : periods === 4 ? 'Quarter break' : 'Break'
}

// How many swaps to suggest at once: small-sided games rotate the whole bench.
export function pairsPerSwap(onField: number) {
  return onField <= 5 ? 99 : Math.round(onField / 3.5)
}
