export const UNIT_OPTIONS = [
  '捲 roll',
  '張 sheet',
  '片 Pcs',
  '盒 box',
  '套 Set',
] as const

export function normalizeUnit(unit?: string): string {
  const val = String(unit || '').trim()
  if (!val) return '片 Pcs'
  return UNIT_OPTIONS.includes(val as any) ? val : val
}

export function getUnitOptions(current?: string): string[] {
  const normalized = normalizeUnit(current)
  if (UNIT_OPTIONS.includes(normalized as any)) return [...UNIT_OPTIONS]
  return [normalized, ...UNIT_OPTIONS]
}
