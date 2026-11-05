import type { CellGrid } from '../xlsx/readWorkbook'
import type { ExamHeader, Item, Warning } from '../model/types'
import { decodeKey } from './legend'
import { parseExamHeader } from './header'
import { ParseError } from './errors'

export interface AnswerKeyParse {
  fileName: string
  header: ExamHeader
  items: Item[]
  maxima: { mc: number | null; cr: number | null; etc: number | null; bonus: number | null; total: number | null }
  warnings: Warning[]
}

/** NEIS "정기시험 교과목별 정답/배점" (문항|배점|정답|복수구분 블록이 가로로 반복) */
export function parseAnswerKey(grid: CellGrid, fileName: string): AnswerKeyParse {
  const warnings: Warning[] = []
  let header: ExamHeader = { raw: '' }
  for (let r = 1; r <= Math.min(grid.rows, 8); r++) {
    const line = grid.rowTexts(r).filter((x) => x !== '').join('   ')
    if (/학년도/.test(line) && !header.raw) header = parseExamHeader(line)
    const m = /고사\s*:\s*(.+?)\s+교과목\s*:\s*(\S+)/.exec(line)
    if (m) {
      header.examName = m[1]!.trim()
      header.subject = m[2]!.trim()
    }
  }
  delete header.classNo

  const maxima = { mc: null as number | null, cr: null as number | null, etc: null as number | null, bonus: null as number | null, total: null as number | null }
  const mxRow = grid.findRow((t) => t.some((x) => /선택형\s*만점/.test(x)), 1, 12)
  if (mxRow) {
    const t = grid.rowTexts(mxRow)
    const col = (re: RegExp) => t.findIndex((x) => re.test(x.replace(/\s+/g, ''))) + 1
    const mcC = col(/선택형만점/)
    const crC = col(/서답형만점/)
    const etcC = col(/기타점수/)
    const bonusC = col(/가산점/)
    if (mcC) maxima.mc = grid.num(mxRow + 1, mcC)
    if (crC) maxima.cr = grid.num(mxRow + 1, crC)
    if (etcC) maxima.etc = grid.num(mxRow + 1, etcC)
    if (bonusC) maxima.bonus = grid.num(mxRow + 1, bonusC)
    const above = grid.rowTexts(mxRow - 1)
    const totC = above.findIndex((x) => /과목\s*만점/.test(x)) + 1
    if (totC) maxima.total = grid.num(mxRow + 1, totC)
  }

  const items: Item[] = []
  let kind: 'mc' | 'cr' = 'mc'
  let r = 1
  while (r <= grid.rows) {
    const texts = grid.rowTexts(r)
    const first = texts.find((x) => x !== '') ?? ''
    if (/^서답형$/.test(first)) kind = 'cr'
    if (/^선택형$/.test(first)) kind = 'mc'
    const starts = texts.map((x, i) => (x.replace(/\s+/g, '') === '문항' ? i + 1 : 0)).filter(Boolean)
    if (starts.length < 2) {
      r++
      continue
    }
    const blocks = starts.map((s) => {
      const limit = (starts.find((x) => x > s) ?? grid.cols + 1) - 1
      const findIn = (re: RegExp) => {
        for (let c = s + 1; c <= limit; c++) if (re.test(texts[c - 1]!.replace(/\s+/g, ''))) return c
        return 0
      }
      return { noCol: s, ptsCol: findIn(/^배점$/) || s + 1, keyCol: findIn(/^정답$/) || s + 2, multiCol: findIn(/복수/) || s + 3 }
    })
    let rr = r + 1
    while (rr <= grid.rows) {
      const nos = blocks.map((b) => grid.int(rr, b.noCol))
      if (nos.every((n) => n == null)) break
      blocks.forEach((b, bi) => {
        const no = nos[bi]
        if (no == null) return
        const points = grid.num(rr, b.ptsCol)
        if (points == null) return
        const keyText = grid.text(rr, b.keyCol)
        const multiText = grid.text(rr, b.multiCol)
        let key = kind === 'mc' ? decodeKey(keyText) : null
        if (kind === 'mc' && multiText) {
          const extra = decodeKey(multiText)
          if (extra) {
            const union = new Set<number>([...(key?.key ?? []), ...extra.key])
            key = { key: [...union].sort((a, b) => a - b), keyMode: 'any' }
            warnings.push({ level: 'info', code: 'multi-key', message: `${fileName}: ${no}번 문항에 복수구분("${multiText}")이 있어 ${key.key.join(',')}번을 모두 정답으로 봅니다.` })
          } else {
            warnings.push({ level: 'info', code: 'multi-key', message: `${fileName}: ${no}번 문항에 복수구분 표시("${multiText}")가 있습니다. 채점은 정오표(NEIS 채점 결과) 기준으로 합니다.` })
          }
        }
        if (kind === 'mc' && !key) warnings.push({ level: 'warn', code: 'answerkey-no-key', message: `${fileName}: ${no}번 문항의 정답("${keyText}")을 읽지 못했습니다.` })
        items.push({
          no,
          kind,
          label: kind === 'mc' ? String(no) : `서답${no}`,
          points,
          key: key?.key ?? [],
          keyMode: key?.keyMode ?? 'single',
          standards: [],
        })
      })
      rr++
    }
    r = rr
  }
  if (items.length === 0) throw new ParseError('no-items', `${fileName}: 정답/배점표에서 문항을 찾지 못했습니다.`)
  items.sort((a, b) => (a.kind === b.kind ? a.no - b.no : a.kind === 'mc' ? -1 : 1))
  return { fileName, header, items, maxima, warnings }
}
