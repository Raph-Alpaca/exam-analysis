import type { CellGrid } from '../xlsx/readWorkbook'
import type { Difficulty, ExamHeader, Item, Standard, Warning } from '../model/types'
import { decodeKey } from './legend'
import { ParseError } from './errors'
import { parseItemNo, RE_CR_MAX, RE_CR_SECTION, RE_MC_MAX, RE_MC_SECTION } from './terms'

export interface ItemInfoParse {
  fileName: string
  header: ExamHeader
  items: Item[]
  standards: Standard[]
  maxima: { mc: number | null; cr: number | null; total: number | null }
  warnings: Warning[]
}

interface Cols {
  noCol: number
  domainCol: number
  stdCol: number
  pointsCol: number
  keyCol: number
  /** 난이도 표시 열(○ 표시) → 난이도 */
  diffCols: Map<number, Difficulty>
  /** 난이도가 글자로 적힌 열 (예: "상", "보통") */
  diffTextCol: number
}

/** 3단계·5단계·상중하 표기를 3단계 난이도로 */
const DIFF_LABEL: Record<string, Difficulty> = {
  어려움: '어려움',
  매우어려움: '어려움',
  상: '어려움',
  중상: '어려움',
  보통: '보통',
  중: '보통',
  쉬움: '쉬움',
  매우쉬움: '쉬움',
  하: '쉬움',
  중하: '쉬움',
}

function diffFromText(t: string): Difficulty | undefined {
  const s = t.replace(/\s+/g, '')
  if (!s) return undefined
  if (DIFF_LABEL[s]) return DIFF_LABEL[s]
  if (/어려/.test(s)) return '어려움'
  if (/쉬/.test(s)) return '쉬움'
  if (/보통/.test(s)) return '보통'
  return undefined
}

const NOT_A_MARK = new Set(['-', '0', 'X', 'x', '×'])

const RE_CODE = /\[[^\]]+\]/g
const RE_FOOTER_SLASH = /^\/$/

function isFooterRow(texts: string[]): boolean {
  const nonEmpty = texts.filter((t) => t !== '')
  if (nonEmpty.length === 0) return true
  // "1 / 2  학교명" 꼴
  const hasSlash = nonEmpty.some((t) => RE_FOOTER_SLASH.test(t))
  const ints = nonEmpty.filter((t) => /^\d+$/.test(t)).length
  return hasSlash && ints >= 1 && nonEmpty.length <= 5
}

function splitStandards(text: string): { code: string; text: string }[] {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return []
  const codes = [...t.matchAll(RE_CODE)]
  if (codes.length === 0) return [{ code: t, text: t }]
  const out: { code: string; text: string }[] = []
  codes.forEach((m, i) => {
    const start = m.index! + m[0].length
    const end = i + 1 < codes.length ? codes[i + 1]!.index! : t.length
    out.push({ code: m[0], text: t.slice(start, end).trim() })
  })
  return out
}

/** NEIS "문항정보표"(성취기준형) */
export function parseItemInfo(grid: CellGrid, fileName: string): ItemInfoParse {
  const warnings: Warning[] = []
  const header: ExamHeader = { raw: '' }
  for (let r = 1; r <= Math.min(grid.rows, 8); r++) {
    const cells = grid.rowTexts(r).filter((x) => x !== '')
    const line = cells.join('  ')
    const subj = /\(\s*(.+?)\s*\)\s*과목/.exec(line)
    if (subj && !header.subject) header.subject = subj[1]
    // 고사명은 한 칸 안에서 끝까지 읽는다 ("제1회 지필고사"처럼 띄어 쓴 이름)
    for (const cell of cells) {
      const ym = /(\d{4})\s*년도\s*(\d)\s*학기\s*(.+?)\s*$/.exec(cell.replace(/\s+/g, ' '))
      if (ym && !header.year) {
        header.year = ym[1]
        header.semester = ym[2]
        header.examName = ym[3]
      }
    }
    const gr = /(\d)\s*학년/.exec(line)
    if (gr && !header.grade) header.grade = gr[1]
    if (!header.raw && /년도/.test(line)) header.raw = line
  }
  const maxima = { mc: null as number | null, cr: null as number | null, total: null as number | null }
  for (let r = 1; r <= Math.min(grid.rows, 10); r++) {
    const line = grid.rowTexts(r).join(' ')
    const t = /총점\s*([\d.]+)\s*점/.exec(line)
    if (t) maxima.total = Number(t[1])
    const m = RE_MC_MAX.exec(line)
    if (m) maxima.mc = Number(m[1])
    const c = RE_CR_MAX.exec(line)
    if (c) maxima.cr = Number(c[1])
  }

  const items: Item[] = []
  const stdText = new Map<number, string>() // item index → 성취기준 원문
  let cols: Cols | null = null
  let kind: 'mc' | 'cr' = 'mc'
  let afterTotal = false
  let lastIdx = -1
  let r = 1
  while (r <= grid.rows) {
    const texts = grid.rowTexts(r)
    const joined = texts.join(' ')
    if (/문항번호/.test(joined) && /성취기준/.test(joined)) {
      const find = (re: RegExp) => texts.findIndex((t) => re.test(t.replace(/\s+/g, ''))) + 1
      const next = grid.rowTexts(r + 1)
      const noCol = find(/문항번호/)
      // 바로 아래 행이 "어려움 보통 쉬움"(또는 상/중/하) 같은 난이도 하위 머리글인지
      const nextIsSub = grid.int(r + 1, noCol) == null && next.filter((t) => DIFF_LABEL[t.replace(/\s+/g, '')]).length >= 2
      const diffCols = new Map<number, Difficulty>()
      if (nextIsSub)
        next.forEach((t, i) => {
          const d = DIFF_LABEL[t.replace(/\s+/g, '')]
          if (d) diffCols.set(i + 1, d)
        })
      cols = {
        noCol,
        domainCol: find(/내용영역|평가영역|단원/),
        stdCol: find(/성취기준/),
        pointsCol: find(/^배점$/),
        keyCol: find(/^정답$/),
        diffCols,
        diffTextCol: diffCols.size ? 0 : find(/난이도/),
      }
      afterTotal = false
      r += nextIsSub ? 2 : 1
      continue
    }
    if (!cols) {
      r++
      continue
    }
    const first = texts.find((t) => t !== '') ?? ''
    if (RE_CR_SECTION.test(first)) {
      kind = 'cr'
      afterTotal = false
      r++
      continue
    }
    if (RE_MC_SECTION.test(first)) {
      kind = 'mc'
      afterTotal = false
      r++
      continue
    }
    // 총합계·비율 행 뒤에는 새 구역 머리글이 나올 때까지 문항을 읽지 않는다 (서답형 구역이 뒤에 올 수 있음)
    if (/^총\s*합\s*계|^소\s*계|^합\s*계|^비율/.test(first)) {
      afterTotal = true
      r++
      continue
    }
    if (afterTotal || isFooterRow(texts)) {
      r++
      continue
    }
    // 문항번호 칸: "3", "서답1", "서술형 2" … 이름에 서답형 낱말이 있으면 구역과 무관하게 서답형
    const noText = grid.text(r, cols.noCol)
    const rowPoints = cols.pointsCol ? grid.num(r, cols.pointsCol) : null
    let parsedNo = parseItemNo(noText)
    if (!parsedNo && noText !== '' && rowPoints != null && rowPoints > 0 && kind === 'cr') {
      // "1-(2)" 같은 하위 문항: 서답형 구역에서 배점이 있으면 순번을 매겨 문항으로 읽는다
      parsedNo = { no: items.filter((i) => i.kind === 'cr').length + 1, cr: true }
    }
    if (parsedNo) {
      const no = parsedNo.no
      const rowKind: 'mc' | 'cr' = parsedNo.cr ? 'cr' : kind
      const rowLabel = rowKind === 'mc' ? String(no) : /^\d+$/.test(noText) ? `서답${no}` : noText.replace(/\s+/g, ' ')
      let difficulty: Difficulty | undefined
      for (const [c, d] of cols.diffCols) {
        const t = grid.text(r, c).replace(/\s+/g, '')
        if (t && !NOT_A_MARK.has(t)) difficulty = d
      }
      if (!difficulty && cols.diffTextCol) difficulty = diffFromText(grid.text(r, cols.diffTextCol))
      const points = rowPoints
      const keyText = cols.keyCol ? grid.text(r, cols.keyCol) : ''
      const key = rowKind === 'mc' ? decodeKey(keyText) : null
      if (rowKind === 'mc' && !key) warnings.push({ level: 'warn', code: 'iteminfo-no-key', message: `${fileName}: ${no}번 문항의 정답("${keyText.slice(0, 30)}")을 읽지 못했습니다.` })
      items.push({
        no,
        kind: rowKind,
        label: rowLabel,
        points: points ?? 0,
        key: key?.key ?? [],
        keyMode: key?.keyMode ?? 'single',
        difficulty,
        domain: cols.domainCol ? grid.text(r, cols.domainCol) || undefined : undefined,
        standards: [],
      })
      lastIdx = items.length - 1
      stdText.set(lastIdx, cols.stdCol ? grid.text(r, cols.stdCol) : '')
      r++
      continue
    }
    // 문항번호 칸에 글자가 있거나 배점이 있는 행은 이어쓰기가 아니다. 문항처럼 보이는데 못 읽었으면 알린다.
    if (noText !== '' || rowPoints != null) {
      if (rowPoints != null && rowPoints > 0) {
        warnings.push({ level: 'warn', code: 'iteminfo-row-skipped', message: `${fileName}: 문항번호 "${noText.slice(0, 20)}"(배점 ${rowPoints}) 행을 문항으로 읽지 못해 건너뛰었습니다.` })
      }
      r++
      continue
    }
    // 고아 행(문항번호·배점이 모두 빈 행): 직전 문항의 성취기준(또는 내용영역) 이어쓰기
    if (lastIdx >= 0) {
      const cont = cols.stdCol ? grid.text(r, cols.stdCol) : ''
      if (cont) stdText.set(lastIdx, (stdText.get(lastIdx) ?? '') + cont)
      const dcont = cols.domainCol ? grid.text(r, cols.domainCol) : ''
      if (dcont && items[lastIdx]!.domain) items[lastIdx]!.domain += dcont
    }
    r++
  }
  if (items.length === 0) throw new ParseError('no-items', `${fileName}: 문항정보표에서 문항 행을 찾지 못했습니다.`)

  const standards: Standard[] = []
  const byCode = new Map<string, Standard>()
  items.forEach((it, idx) => {
    const parts = splitStandards(stdText.get(idx) ?? '')
    for (const p of parts) {
      let s = byCode.get(p.code)
      if (!s) {
        s = { code: p.code, text: p.text, domain: it.domain, itemNos: [] }
        byCode.set(p.code, s)
        standards.push(s)
      } else if (p.text.length > s.text.length) {
        s.text = p.text
      }
      if (!s.itemNos.includes(it.no) || it.kind === 'cr') s.itemNos.push(it.no)
      it.standards.push(p.code)
    }
  })
  return { fileName, header, items, standards, maxima, warnings }
}
