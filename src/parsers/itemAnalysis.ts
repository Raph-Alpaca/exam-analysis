import type { CellGrid } from '../xlsx/readWorkbook'
import type { ChoiceKey, ExamHeader, GradeItemRef, Warning } from '../model/types'
import { parseExamHeader } from './header'
import { ParseError } from './errors'

export interface ItemAnalysisParse {
  fileName: string
  header: ExamHeader
  items: GradeItemRef[]
  classN: number | null
  gradeN: number | null
  warnings: Warning[]
}

const RE_PAIR = /^(\d+)\(\s*(\d+)\)$/
const RE_PCT_PAIR = /^([\d.]+)\(\s*([\d.]+)\)$/

function pair(text: string): [number, number] | null {
  const m = RE_PAIR.exec(text.replace(/\s+/g, ''))
  return m ? [Number(m[1]), Number(m[2])] : null
}
function pctPair(text: string): [number, number] | null {
  const m = RE_PCT_PAIR.exec(text.replace(/\s+/g, ''))
  return m ? [Number(m[1]), Number(m[2])] : null
}

interface Cols {
  noCol: number
  choice: number[] // index 0..4 → column
  sumCol: number
  keyCol: number
  pCol: number
  blankCol: number
  multiCol: number
}

function headerCols(texts: string[]): Cols | null {
  const find = (re: RegExp) => texts.findIndex((t) => re.test(t.replace(/\s+/g, ''))) + 1
  const choice = [1, 2, 3, 4, 5].map((k) => find(new RegExp(`^${k}번$`)))
  if (choice.some((c) => !c)) return null
  const noCol = find(/문항번호/)
  if (!noCol) return null
  return {
    noCol,
    choice,
    sumCol: find(/^합계$/),
    keyCol: find(/^정답$/),
    pCol: find(/정답률/),
    blankCol: find(/무표기/),
    multiCol: find(/중복표기/),
  }
}

/** NEIS "정기시험 문항분석표": 반(학년전체) 형식의 답지별 인원·정답률 */
export function parseItemAnalysis(grid: CellGrid, fileName: string): ItemAnalysisParse {
  const warnings: Warning[] = []
  let header: ExamHeader = { raw: '' }
  for (let r = 1; r <= Math.min(grid.rows, 12); r++) {
    const line = grid.rowTexts(r).filter((x) => x !== '').join('   ')
    if (/학년도/.test(line)) {
      header = parseExamHeader(line)
      break
    }
  }
  for (let r = 1; r <= Math.min(grid.rows, 12); r++) {
    const line = grid.rowTexts(r).join(' ')
    const m = /고사\s*:\s*(.+?)\s+교과목\s*:\s*(\S+)/.exec(line)
    if (m) {
      header.examName = m[1]!.trim()
      header.subject = m[2]!.trim()
      break
    }
  }

  const items: GradeItemRef[] = []
  let cols: Cols | null = null
  for (let r = 1; r <= grid.rows; r++) {
    const texts = grid.rowTexts(r)
    const hc = headerCols(texts)
    if (hc) {
      cols = hc
      continue
    }
    if (!cols) continue
    const no = grid.int(r, cols.noCol)
    if (no == null) continue
    const pairs = cols.choice.map((c) => pair(grid.text(r, c)))
    if (pairs.some((p) => !p)) continue
    const classCounts: Record<ChoiceKey, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, none: 0 }
    const gradeCounts: Record<ChoiceKey, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, none: 0 }
    pairs.forEach((p, i) => {
      classCounts[(i + 1) as 1 | 2 | 3 | 4 | 5] = p![0]
      gradeCounts[(i + 1) as 1 | 2 | 3 | 4 | 5] = p![1]
    })
    const blank = cols.blankCol ? pair(grid.text(r, cols.blankCol)) : null
    const multi = cols.multiCol ? pair(grid.text(r, cols.multiCol)) : null
    classCounts.none = (blank?.[0] ?? 0) + (multi?.[0] ?? 0)
    gradeCounts.none = (blank?.[1] ?? 0) + (multi?.[1] ?? 0)
    const key = cols.keyCol ? grid.int(r, cols.keyCol) : null
    const pp = cols.pCol ? pctPair(grid.text(r, cols.pCol)) : null
    const classN = cols.sumCol ? (grid.int(r, cols.sumCol) ?? 0) : 0
    // 학년 전체 인원은 정답 인원 / 정답률로 역산 (중복표기는 여러 답지에 중복 계산되므로 합산 불가)
    let gradeN = 0
    if (key && pp && pp[1] > 0) gradeN = Math.round((gradeCounts[key as 1 | 2 | 3 | 4 | 5] * 100) / pp[1])
    items.push({
      no,
      key: key && key >= 1 && key <= 5 ? key : null,
      classCounts,
      gradeCounts,
      classN,
      gradeN,
      classP: pp ? pp[0] : null,
      gradeP: pp ? pp[1] : null,
    })
  }
  if (items.length === 0) throw new ParseError('no-items', `${fileName}: 문항분석표에서 문항 행을 찾지 못했습니다.`)
  items.sort((a, b) => a.no - b.no)

  const mode = (xs: number[]): number | null => {
    const m = new Map<number, number>()
    for (const x of xs) if (x > 0) m.set(x, (m.get(x) ?? 0) + 1)
    let best: number | null = null
    let bc = 0
    for (const [v, c] of m) if (c > bc) (best = v), (bc = c)
    return best
  }
  const classN = mode(items.map((i) => i.classN))
  const gradeN = mode(items.map((i) => i.gradeN))
  for (const it of items) {
    if (classN) it.classN = classN
    if (gradeN) it.gradeN = gradeN
  }
  if (!gradeN) warnings.push({ level: 'warn', code: 'grade-n-unknown', message: `${fileName}: 학년 전체 인원을 역산하지 못했습니다.` })
  return { fileName, header, items, classN, gradeN, warnings }
}
