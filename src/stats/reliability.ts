import { variance } from './descriptive'
import type { Scored } from './scoring'

/**
 * Cronbach α = k/(k−1) · (1 − Σσ²ᵢ / σ²ₜ).
 * rows[s][i] = 학생 s 의 문항 i 점수. 모집단 분산 사용(비율이라 표본 분산과 결과 동일).
 */
export function cronbachAlpha(rows: readonly (readonly number[])[]): number | null {
  const n = rows.length
  if (n < 2) return null
  const k = rows[0]!.length
  if (k < 2) return null
  let sumItemVar = 0
  for (let i = 0; i < k; i++) {
    const col = rows.map((r) => r[i] ?? 0)
    sumItemVar += variance(col, 'population') ?? 0
  }
  const totals = rows.map((r) => r.reduce((a, b) => a + b, 0))
  const vt = variance(totals, 'population')
  if (vt == null || vt <= 1e-12) return null
  return (k / (k - 1)) * (1 - sumItemVar / vt)
}

/** 선다형 0/1 KR-20 (KICE 프로그램의 "검사신뢰도") */
export function alphaMc(scored: readonly Scored[]): number | null {
  return cronbachAlpha(scored.map((s) => s.itemEarned.map((e) => (e > 0 ? 1 : 0))))
}

/** 배점 가중 선다형 + (있으면) 서답형 문항별 점수 */
export function alphaAll(scored: readonly Scored[]): number | null {
  return cronbachAlpha(scored.map((s) => [...s.itemEarned, ...s.crEarned]))
}
