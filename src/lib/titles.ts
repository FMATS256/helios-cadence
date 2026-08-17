/** Courtesy titles used across the platform (forms + emails). */
export const TITLES = [
  'Mr',
  'Mrs',
  'Ms',
  'Miss',
  'Dr',
  'Prof',
  'Eng',
  'Rev',
  'Hon',
  'Sr',
] as const

export type Title = (typeof TITLES)[number]

/** "Dear Mr Matare," / "Dear Acme Ltd," / "Hello there," */
export function greeting(title?: string | null, name?: string | null) {
  const clean = (name ?? '').trim()
  const t = (title ?? '').trim().replace(/\.$/, '')
  if (!clean) return 'Hello there,'
  return `Dear ${t ? `${t} ` : ''}${clean},`
}
