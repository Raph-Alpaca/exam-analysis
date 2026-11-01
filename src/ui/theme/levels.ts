import type { Level } from '../../model/types'

export const LEVEL_COLORS: Record<Level, string> = {
  A: '#1b4f9c',
  B: '#4a86c8',
  C: '#a3c4e3',
  D: '#f4b942',
  E: '#e05c3a',
}
export const LEVEL_TEXT: Record<Level, string> = {
  A: '#ffffff',
  B: '#ffffff',
  C: '#10233d',
  D: '#3a2a00',
  E: '#ffffff',
}
export const LEVEL_LABEL: Record<Level, string> = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' }

export const TONE_COLORS = {
  danger: '#b91c1c',
  warn: '#b45309',
  good: '#15803d',
  neutral: '#6b7280',
  accent: '#1b4f9c',
} as const

/** 0~100 값을 파란 단일 색조 농도로 (표의 열지도용) */
export function heatStyle(v: number | null | undefined, max = 100): { background?: string; color?: string } {
  if (v == null || !Number.isFinite(v)) return {}
  const t = Math.max(0, Math.min(1, v / max))
  const alpha = 0.08 + t * 0.72
  return { background: `rgba(27, 79, 156, ${alpha.toFixed(3)})`, color: t > 0.6 ? '#fff' : '#1f2937' }
}

/** 정답률 셀 음영 (낮을수록 경고색) */
export function pShadeClass(p: number | null | undefined): string {
  if (p == null) return ''
  if (p < 25) return 'shade-danger'
  if (p < 50) return 'shade-warn'
  return ''
}
