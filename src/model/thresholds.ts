import type { Difficulty } from './types'
import { fmt2, fmt3 } from './format'

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

/** 변별도·신뢰도를 화면·보고서에 적는 소수 자릿수 */
export const DISC_DIGITS = 2
export const ALPHA_DIGITS = 3

/**
 * 판정에 쓰는 값: 화면·보고서에 보이는 자릿수로 맞춘 값.
 * 0.1996 은 "0.20"으로 보이므로 .20 으로 판정해야 표의 숫자와 판정이 어긋나지 않는다.
 * (기준값 .10/.20/… 자체가 소수 둘째 자리까지만 정해진 경험적 기준이다.)
 */
export function shownValue(v: number, digits: typeof DISC_DIGITS | typeof ALPHA_DIGITS): number {
  // 화면에 찍는 것과 같은 포매터를 거쳐야 반올림이 정확히 같다 (toFixed 는 0.295 를 0.29 로, 화면은 "0.30"으로 적는다)
  const n = Number(digits === DISC_DIGITS ? fmt2(v) : fmt3(v))
  return n === 0 ? 0 : n
}

/** 변별도 해석 (교육부·KICE 표 4-6) */
export function discBand(disc: number | null): Band | null {
  if (disc == null) return null
  const d = shownValue(disc, DISC_DIGITS)
  if (d < 0.1) return { label: '변별력 없음', tone: 'danger' }
  if (d < 0.2) return { label: '매우 낮음', tone: 'danger' }
  if (d < 0.3) return { label: '낮음', tone: 'warn' }
  if (d < 0.4) return { label: '있음', tone: 'neutral' }
  return { label: '높음', tone: 'good' }
}

/** 신뢰도 해석 (Knapp, 1991; 표 4-7) */
export function alphaBand(alpha: number | null): Band | null {
  if (alpha == null) return null
  const a = shownValue(alpha, ALPHA_DIGITS)
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
