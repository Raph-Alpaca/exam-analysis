import type { Level } from '../../model/types'

export const INK = '#17213a'

/**
 * 성취수준 A~E — 순서형이므로 한 색상(파랑)의 진하기 5단계. A가 가장 진하다.
 * dataviz 순서형 검증(밝기 단조, 단계 간 ΔL ≥ 0.06, 가장 연한 단계도 배경 대비 2:1, 단일 색상) 통과.
 */
export const LEVEL_COLORS: Record<Level, string> = {
  A: '#0d366b',
  B: '#1c5cab',
  C: '#2a78d6',
  D: '#5598e7',
  E: '#86b6ef',
}
/** 칩·막대 안 글자: 진한 A~C는 흰 글자, 연한 D~E는 잉크 글자 (APCA 기준) */
export const LEVEL_TEXT: Record<Level, string> = {
  A: '#ffffff',
  B: '#ffffff',
  C: '#ffffff',
  D: INK,
  E: INK,
}
export const LEVEL_LABEL: Record<Level, string> = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' }

export const TONE_COLORS = {
  danger: '#b42318',
  warn: '#93370d',
  good: '#067647',
  neutral: '#5b6478',
  /** 한 계열 차트의 기본 막대색 */
  accent: '#2a78d6',
  /** 정답률 50% 미만 막대 (열지도의 낮은 쪽과 같은 주황) */
  low: '#e88658',
} as const

/* ---------- 정답률·성취율 열지도: 50%를 회색 기준으로 낮으면 주황, 높으면 파랑 (OKLab 보간) ---------- */

const HEAT_LOW = '#e88658'
const HEAT_MID = '#eef0f3'
const HEAT_HIGH = '#6da7ec'

type Lab = [number, number, number]
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(toLin) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function labToHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, toGam(v))) * 255).toString(16).padStart(2, '0')).join('')
}

const LAB_LOW = hexToLab(HEAT_LOW)
const LAB_MID = hexToLab(HEAT_MID)
const LAB_HIGH = hexToLab(HEAT_HIGH)
const mix = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** 0~100 값을 열지도 색으로 (50 = 회색). 모든 단계에서 잉크 글자 대비 6:1 이상 */
export function heatColor(v: number, max = 100): string {
  const p = Math.max(0, Math.min(1, v / max))
  const t = (p - 0.5) * 2
  return labToHex(t < 0 ? mix(LAB_MID, LAB_LOW, -t) : mix(LAB_MID, LAB_HIGH, t))
}

/** 표 칸 열지도. 글자는 항상 잉크 색이라 인쇄해도 읽힌다. */
export function heatStyle(v: number | null | undefined, max = 100): { background?: string; color?: string } {
  if (v == null || !Number.isFinite(v)) return {}
  return { background: heatColor(v, max), color: INK }
}

/** 범례용 그라디언트 (OKLab 보간과 같은 색이 되도록 10% 간격 정지점) */
export const HEAT_GRADIENT = `linear-gradient(90deg, ${Array.from({ length: 11 }, (_, i) => `${heatColor(i * 10)} ${i * 10}%`).join(', ')})`

/** 정답률 칸 음영 (낮을수록 진한 주황) */
export function pShadeClass(p: number | null | undefined): string {
  if (p == null) return ''
  if (p < 25) return 'shade-danger'
  if (p < 50) return 'shade-warn'
  return ''
}
