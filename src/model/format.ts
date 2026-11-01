const nf1 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const nf0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 })

export const DASH = '-'

function ok(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

export function fmt1(v: number | null | undefined): string {
  return ok(v) ? nf1.format(v) : DASH
}
export function fmt2(v: number | null | undefined): string {
  return ok(v) ? nf2.format(v) : DASH
}
export function fmt3(v: number | null | undefined): string {
  return ok(v) ? nf3.format(v) : DASH
}
export function fmtInt(v: number | null | undefined): string {
  return ok(v) ? nf0.format(v) : DASH
}
/** 배점처럼 정수면 정수로, 아니면 소수 최대 2자리 */
export function fmtPoints(v: number | null | undefined): string {
  if (!ok(v)) return DASH
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
}
export function round(v: number, digits = 2): number {
  const f = 10 ** digits
  return Math.round((v + Number.EPSILON) * f) / f
}
