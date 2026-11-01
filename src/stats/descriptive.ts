import type { MeanSd } from '../model/types'

export type SdMode = 'population' | 'sample'

export function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

export function mean(xs: readonly number[]): number | null {
  return xs.length === 0 ? null : sum(xs) / xs.length
}

/** 분산. population: ÷N (KICE 프로그램과 동일), sample: ÷(N-1) */
export function variance(xs: readonly number[], mode: SdMode = 'population'): number | null {
  const n = xs.length
  if (n === 0 || (mode === 'sample' && n < 2)) return null
  const m = sum(xs) / n
  let ss = 0
  for (const x of xs) ss += (x - m) * (x - m)
  return ss / (mode === 'sample' ? n - 1 : n)
}

export function sd(xs: readonly number[], mode: SdMode = 'population'): number | null {
  const v = variance(xs, mode)
  return v == null ? null : Math.sqrt(v)
}

export function meanSd(xs: readonly number[], mode: SdMode = 'population'): MeanSd {
  return { mean: mean(xs), sd: sd(xs, mode) }
}

/** 피어슨 상관. 분산이 0이면 null */
export function pearson(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length)
  if (n < 2) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += x[i]!
    my += y[i]!
  }
  mx /= n
  my /= n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx
    const dy = y[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx <= 1e-12 || syy <= 1e-12) return null
  return sxy / Math.sqrt(sxx * syy)
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? (100 * part) / whole : null
}
