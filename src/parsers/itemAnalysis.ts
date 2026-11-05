import type { CellGrid } from '../xlsx/readWorkbook'
import type { ChoiceKey, ExamHeader, GradeItemRef, Warning } from '../model/types'
import { parseExamHeader } from './header'
import { ParseError } from './errors'

export interface ItemAnalysisParse {
  fileName: string
  header: ExamHeader
  /** 문항분석표가 어느 반 것인지 */
  classNo?: string
  items: GradeItemRef[]
  classN: number | null
  gradeN: number | null
  warnings: Warning[]
}

const RE_PAIR = /^(\d+)\((\d+)\)$/
const RE_PCT_PAIR = /^([\d.]+)\(([\d.]+)\)$/

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

/**
 * NEIS "정기시험 문항분석표": 반(학년전체) 형식의 답지별 인원·정답률.
 *
 * NEIS 보고서는 위 행과 값이 같은 무표기·중복표기 칸을 세로로 병합한다.
 * "보고서 형태"로 받으면 병합 셀로(→ CellGrid 가 채움), "XLS data"로 받으면 빈 칸으로 온다.
 * 그래서 빈 칸은 같은 페이지의 바로 위 값으로 채운다(페이지 첫 행이 비면 0).
 */
export function parseItemAnalysis(grid: CellGrid, fileName: string): ItemAnalysisParse {
  const warnings: Warning[] = []
  let header: ExamHeader = { raw: '' }
  let classNo: string | undefined
  for (let r = 1; r <= Math.min(grid.rows, 12); r++) {
    const line = grid.rowTexts(r).filter((x) => x !== '').join('   ')
    if (/학년도/.test(line)) {
      header = parseExamHeader(line)
      // "2026학년도   2학기   주간 3학년   1" → 마지막 숫자가 반 (또는 "1반")
      const m = /\d\s*학년\s+(\d+)\s*(?:반)?\s*$/.exec(line.trim())
      classNo = m ? String(Number(m[1])) : header.classNo
      break
    }
  }
  delete header.classNo
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
  let lastBlank: [number, number] = [0, 0]
  let lastMulti: [number, number] = [0, 0]
  for (let r = 1; r <= grid.rows; r++) {
    const texts = grid.rowTexts(r)
    const hc = headerCols(texts)
    if (hc) {
      cols = hc
      lastBlank = [0, 0]
      lastMulti = [0, 0]
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
    const blank = (cols.blankCol ? pair(grid.text(r, cols.blankCol)) : null) ?? lastBlank
    const multi = (cols.multiCol ? pair(grid.text(r, cols.multiCol)) : null) ?? lastMulti
    lastBlank = blank
    lastMulti = multi
    classCounts.none = blank[0] + multi[0]
    gradeCounts.none = blank[1] + multi[1]
    const key = cols.keyCol ? grid.int(r, cols.keyCol) : null
    const pp = cols.pCol ? pctPair(grid.text(r, cols.pCol)) : null
    const classN = cols.sumCol ? (grid.int(r, cols.sumCol) ?? 0) : 0
    // 학년 전체 인원은 정답 인원 / 정답률로 역산 (중복표기는 여러 답지에 중복 계산되므로 합산 불가)
    let gradeN = 0
    if (key && key >= 1 && key <= 5 && pp && pp[1] > 0) gradeN = Math.round((gradeCounts[key as 1 | 2 | 3 | 4 | 5] * 100) / pp[1])
    items.push({
      no,
      key: key && key >= 1 && key <= 5 ? key : null,
      classCounts,
      gradeCounts,
      classBlank: blank[0],
      classMulti: multi[0],
      gradeBlank: blank[1],
      gradeMulti: multi[1],
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
  return { fileName, header, classNo, items, classN, gradeN, warnings }
}
