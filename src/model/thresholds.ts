import type { Difficulty } from './types'

/** 3단계 난이도 (Cangelosi, 1990): 정답률 기준 */
export function difficulty3(p: number | null): Difficulty | null {
  if (p == null) return null
  if (p < 25) return '어려움'
  if (p < 75) return '보통'
  return '쉬움'
}

/** 5단계 난이도 (성태제, 2019) */
export function difficulty5(p: number | null): string | null {
  if (p == null) return null
  const d = p / 100
  if (d < 0.2) return '매우 어려움'
  if (d < 0.4) return '어려움'
  if (d < 0.6) return '중간'
  if (d < 0.8) return '쉬움'
  return '매우 쉬움'
}

export type Tone = 'danger' | 'warn' | 'neutral' | 'good'
export interface Band {
  label: string
  tone: Tone
}

/** 변별도 해석 (교육부·KICE 표 4-6) */
export function discBand(d: number | null): Band | null {
  if (d == null) return null
  if (d < 0.1) return { label: '변별력 없음', tone: 'danger' }
  if (d < 0.2) return { label: '매우 낮음', tone: 'danger' }
  if (d < 0.3) return { label: '낮음', tone: 'warn' }
  if (d < 0.4) return { label: '있음', tone: 'neutral' }
  return { label: '높음', tone: 'good' }
}

/** 신뢰도 해석 (Knapp, 1991; 표 4-7) */
export function alphaBand(a: number | null): Band | null {
  if (a == null) return null
  if (a < 0.5) return { label: '수용 불가', tone: 'danger' }
  if (a < 0.6) return { label: '낮음', tone: 'danger' }
  if (a < 0.7) return { label: '의심스러움', tone: 'warn' }
  if (a < 0.8) return { label: '수용 가능', tone: 'neutral' }
  if (a < 0.9) return { label: '높음', tone: 'good' }
  return { label: '매우 높음', tone: 'good' }
}

export const THRESHOLDS = {
  lowP: 50,
  veryLowP: 25,
  highP: 90,
  lowDisc: 0.2,
  highNonePct: 5,
  attractiveDistractorPct: 30,
  minGroupForDisc: 5,
  smallGroup: 5,
} as const
