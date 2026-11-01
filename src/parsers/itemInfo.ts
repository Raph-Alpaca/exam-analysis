import type { CellGrid } from '../xlsx/readWorkbook'
import type { Difficulty, ExamHeader, Item, Standard, Warning } from '../model/types'
import { decodeKey } from './legend'
import { ParseError } from './errors'

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
  diff: Partial<Record<Difficulty, number>>
}

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
    const line = grid.rowTexts(r).filter((x) => x !== '').join('  ')
    const subj = /\(\s*(.+?)\s*\)\s*과목/.exec(line)
    if (subj && !header.subject) header.subject = subj[1]
    const ym = /(\d{4})\s*년도\s*(\d)\s*학기\s*(\S+)/.exec(line)
    if (ym && !header.year) {
      header.year = ym[1]
      header.semester = ym[2]
      header.examName = ym[3]
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
    const m = /선택형\s*([\d.]+)\s*점/.exec(line)
    if (m) maxima.mc = Number(m[1])
    const c = /서답형\s*([\d.]+)\s*점/.exec(line)
    if (c) maxima.cr = Number(c[1])
  }

  const items: Item[] = []
  const stdText = new Map<number, string>() // item index → 성취기준 원문
  let cols: Cols | null = null
  let kind: 'mc' | 'cr' = 'mc'
  let lastIdx = -1
  let r = 1
  while (r <= grid.rows) {
    const texts = grid.rowTexts(r)
    const joined = texts.join(' ')
    if (/문항번호/.test(joined) && /성취기준/.test(joined)) {
      const find = (re: RegExp) => texts.findIndex((t) => re.test(t.replace(/\s+/g, ''))) + 1
      const next = grid.rowTexts(r + 1)
      const findNext = (re: RegExp) => next.findIndex((t) => re.test(t.replace(/\s+/g, ''))) + 1
      cols = {
        noCol: find(/문항번호/),
        domainCol: find(/내용영역/),
        stdCol: find(/성취기준/),
        pointsCol: find(/^배점$/),
        keyCol: find(/^정답$/),
        diff: { 어려움: findNext(/어려움/) || undefined, 보통: findNext(/^보통$/) || undefined, 쉬움: findNext(/쉬움/) || undefined },
      }
      r += Object.values(cols.diff).some(Boolean) ? 2 : 1
      continue
    }
    if (!cols) {
      r++
      continue
    }
    const first = texts.find((t) => t !== '') ?? ''
    if (/^서답형\s*문항/.test(first)) {
      kind = 'cr'
      r++
      continue
    }
    if (/^선택형\s*문항|^선다형\s*문항/.test(first)) {
      kind = 'mc'
      r++
      continue
    }
    if (/^총\s*합\s*계/.test(first)) break
    const no = grid.int(r, cols.noCol)
    if (no != null) {
      let difficulty: Difficulty | undefined
      for (const d of ['어려움', '보통', '쉬움'] as Difficulty[]) {
        const c = cols.diff[d]
        if (c && /[○OoＯ◯●]/.test(grid.text(r, c))) difficulty = d
      }
      const points = cols.pointsCol ? grid.num(r, cols.pointsCol) : null
      const keyText = cols.keyCol ? grid.text(r, cols.keyCol) : ''
      const key = kind === 'mc' ? decodeKey(keyText) : null
      if (kind === 'mc' && !key) warnings.push({ level: 'warn', code: 'iteminfo-no-key', message: `${fileName}: ${no}번 문항의 정답("${keyText}")을 읽지 못했습니다.` })
      items.push({
        no,
        kind,
        label: kind === 'mc' ? String(no) : `서답${no}`,
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
    if (isFooterRow(texts)) {
      r++
      continue
    }
    // 고아 행: 직전 문항의 성취기준(또는 내용영역) 이어쓰기
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
