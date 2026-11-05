import type { KeyMode, Response } from '../model/types'

export type MultiLegend = Record<string, number[]>

/** NEIS 정오표 범례의 복수답안 코드 (A=1,2 … Z=1,2,3,4,5) */
export const DEFAULT_MULTI_CODES: MultiLegend = {
  A: [1, 2],
  B: [1, 3],
  C: [1, 4],
  D: [1, 5],
  E: [2, 3],
  F: [2, 4],
  G: [2, 5],
  H: [3, 4],
  I: [3, 5],
  J: [4, 5],
  K: [1, 2, 3],
  L: [1, 2, 4],
  M: [1, 2, 5],
  N: [1, 3, 4],
  O: [1, 3, 5],
  P: [1, 4, 5],
  Q: [2, 3, 4],
  R: [2, 3, 5],
  S: [2, 4, 5],
  T: [3, 4, 5],
  U: [1, 2, 3, 4],
  V: [1, 2, 3, 5],
  W: [1, 2, 4, 5],
  X: [1, 3, 4, 5],
  Y: [2, 3, 4, 5],
  Z: [1, 2, 3, 4, 5],
}

/**
 * "※ . : 맞음 , 번호 : 틀림 , 알파벳 : 복수답안코드 , - : 무표기A=1,2 , B=1,3 , …" 형태의 범례 행을 해석.
 * 코드가 하나도 없으면 null.
 */
export function parseLegendRow(text: string): MultiLegend | null {
  const out: MultiLegend = {}
  const re = /([A-Z])\s*=\s*((?:\d\s*,\s*)*\d)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const letter = m[1]!
    const nums = m[2]!
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9)
    if (nums.length >= 2) out[letter] = nums
  }
  return Object.keys(out).length > 0 ? out : null
}

const RE_INT = /^\d+$/
const RE_LETTER = /^[A-Za-z]$/
const CIRCLED: Record<string, string> = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' }

/** ①~⑤ 같은 원문자와 전각 숫자를 보통 숫자로 */
function normalizeCell(raw: string): string {
  return raw
    .trim()
    .replace(/[①-⑤]/g, (c) => CIRCLED[c] ?? c)
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

export function decodeResponse(raw: string, legend: MultiLegend = DEFAULT_MULTI_CODES): Response {
  const s = normalizeCell(raw)
  if (s === '' || s === '-' || s === '－' || s === '—') return { k: 'blank' }
  if (s === '.' || s === '．' || s === '·') return { k: 'correct' }
  if (RE_INT.test(s)) {
    const n = Number(s)
    if (n >= 1 && n <= 5) return { k: 'wrong', choice: n }
    return { k: 'invalid', raw: s }
  }
  if (RE_LETTER.test(s)) {
    const codes = legend[s.toUpperCase()]
    if (codes) return { k: 'multi', choices: codes }
  }
  return { k: 'invalid', raw: s }
}

export function decodeKey(raw: string, legend: MultiLegend = DEFAULT_MULTI_CODES): { key: number[]; keyMode: KeyMode } | null {
  const s = normalizeCell(raw)
  if (s === '' || s === '-') return null
  if (RE_INT.test(s)) {
    const n = Number(s)
    return n >= 1 && n <= 5 ? { key: [n], keyMode: 'single' } : null
  }
  if (RE_LETTER.test(s)) {
    const codes = legend[s.toUpperCase()]
    return codes ? { key: [...codes], keyMode: 'all' } : null
  }
  const parts = s
    .split(/[,/·\s]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  if (parts.length >= 2) return { key: parts, keyMode: 'any' }
  return null
}
