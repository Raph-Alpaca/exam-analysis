import type { WorkSheet } from 'xlsx'

export interface Cell {
  v: unknown
  w?: string
  t: string
}

function colIndex(letters: string): number {
  let c = 0
  for (const ch of letters) c = c * 26 + (ch.charCodeAt(0) - 64)
  return c
}

const COL_STRIDE = 20000

/**
 * 워크시트를 1-based (row, col) 좌표로 읽는 얇은 래퍼.
 * `!ref`(dimension)가 잘못된 NEIS 파일이 있어 셀을 직접 순회한다.
 * 병합 셀은 앵커 값을 덮인 셀 전체에 복사한다.
 */
export class CellGrid {
  readonly name: string
  readonly rows: number
  readonly cols: number
  private readonly cells = new Map<number, Cell>()

  constructor(name: string, ws: WorkSheet) {
    this.name = name
    let maxR = 0
    let maxC = 0
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith('!')) continue
      const m = /^([A-Z]+)(\d+)$/.exec(addr)
      if (!m) continue
      const r = Number(m[2])
      const c = colIndex(m[1])
      const cell = ws[addr] as Cell
      if (cell == null || cell.v == null || cell.v === '') continue
      this.cells.set(r * COL_STRIDE + c, cell)
      if (r > maxR) maxR = r
      if (c > maxC) maxC = c
    }
    const merges = (ws['!merges'] ?? []) as { s: { r: number; c: number }; e: { r: number; c: number } }[]
    for (const m of merges) {
      const anchor = this.cells.get((m.s.r + 1) * COL_STRIDE + (m.s.c + 1))
      if (!anchor) continue
      for (let r = m.s.r + 1; r <= m.e.r + 1; r++) {
        for (let c = m.s.c + 1; c <= m.e.c + 1; c++) {
          const k = r * COL_STRIDE + c
          if (!this.cells.has(k)) this.cells.set(k, anchor)
          if (r > maxR) maxR = r
          if (c > maxC) maxC = c
        }
      }
    }
    this.rows = maxR
    this.cols = maxC
  }

  get(r: number, c: number): Cell | undefined {
    return this.cells.get(r * COL_STRIDE + c)
  }

  /** 셀의 표시 문자열. 정수 숫자는 지수 표기 없이 정확한 정수 문자열로. */
  text(r: number, c: number): string {
    const cell = this.get(r, c)
    if (!cell) return ''
    const v = cell.v
    if (typeof v === 'number') {
      if (Number.isInteger(v)) return v.toFixed(0)
      if (cell.w != null && cell.w.trim() !== '') return cell.w.trim()
      return String(v)
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    return String(v).trim()
  }

  num(r: number, c: number): number | null {
    const cell = this.get(r, c)
    if (!cell) return null
    if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? cell.v : null
    const s = String(cell.v).trim().replace(/,/g, '')
    if (s === '' || s === '-') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  int(r: number, c: number): number | null {
    const n = this.num(r, c)
    return n != null && Number.isInteger(n) ? n : null
  }

  /** 1..cols 순서의 텍스트 배열 (index 0 = 1열) */
  rowTexts(r: number): string[] {
    const out: string[] = new Array(this.cols)
    for (let c = 1; c <= this.cols; c++) out[c - 1] = this.text(r, c)
    return out
  }

  /** 조건을 만족하는 첫 행 번호 (없으면 0) */
  findRow(pred: (texts: string[], r: number) => boolean, from = 1, to = this.rows): number {
    const end = Math.min(to, this.rows)
    for (let r = Math.max(1, from); r <= end; r++) {
      if (pred(this.rowTexts(r), r)) return r
    }
    return 0
  }

  /** 정규식에 맞는 셀 목록 */
  findCells(re: RegExp, maxRow = this.rows): { r: number; c: number; text: string }[] {
    const out: { r: number; c: number; text: string }[] = []
    for (const [k, cell] of this.cells) {
      const r = Math.floor(k / COL_STRIDE)
      if (r > maxRow) continue
      const c = k % COL_STRIDE
      const t = typeof cell.v === 'number' ? this.text(r, c) : String(cell.v).trim()
      if (re.test(t)) out.push({ r, c, text: t })
    }
    out.sort((a, b) => a.r - b.r || a.c - b.c)
    return out
  }
}

export function gridFromSheet(name: string, ws: WorkSheet): CellGrid {
  return new CellGrid(name, ws)
}

/** ArrayBuffer/Uint8Array → 시트별 CellGrid (xlsx·xls 모두 가능) */
export async function readWorkbookData(data: ArrayBuffer | Uint8Array, fileName: string): Promise<CellGrid[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data, { type: 'array', cellText: true, cellDates: false })
  return wb.SheetNames.map((n) => gridFromSheet(`${fileName}:${n}`, wb.Sheets[n]!))
}

export async function readWorkbookFile(file: File): Promise<CellGrid[]> {
  const buf = await file.arrayBuffer()
  return readWorkbookData(buf, file.name)
}
