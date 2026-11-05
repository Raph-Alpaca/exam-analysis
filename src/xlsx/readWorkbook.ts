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

export const DRM_HINT = '학교 문서보안(DRM)이 걸린 파일은 브라우저에서 열 수 없습니다. 문서보안을 해제(복호화)한 파일을 올려 주세요.'

/** 파일 앞부분으로 형식 추정: zip(xlsx) / ole(xls·암호 xlsx) / text(html·csv) / drm(문서보안 등 알 수 없는 바이너리) */
export function sniffFormat(bytes: Uint8Array): 'zip' | 'ole' | 'text' | 'drm' | 'empty' {
  if (bytes.length === 0) return 'empty'
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip'
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole'
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  if (/FASOO|SCDSA|DOCUMENT SAFER|MarkAny|DRMONE|<##/i.test(head)) return 'drm'
  let printable = 0
  const n = Math.min(bytes.length, 1024)
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!
    if (b === 9 || b === 10 || b === 13 || b >= 32) printable++
  }
  return printable / n > 0.95 ? 'text' : 'drm'
}

/** ArrayBuffer/Uint8Array → 시트별 CellGrid (xlsx·xls 모두 가능) */
export async function readWorkbookData(data: ArrayBuffer | Uint8Array, fileName: string): Promise<CellGrid[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const fmt = sniffFormat(bytes)
  if (fmt === 'empty') throw new Error('빈 파일입니다.')
  if (fmt === 'drm') throw new Error(`엑셀 파일 형식이 아닙니다. ${DRM_HINT}`)
  const XLSX = await import('xlsx')
  let wb: ReturnType<typeof XLSX.read>
  try {
    wb = XLSX.read(bytes, { type: 'array', cellText: true, cellDates: false })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/password|encrypt/i.test(msg)) throw new Error('암호가 걸린 엑셀 파일입니다. 엑셀에서 암호를 해제하고 저장한 뒤 올려 주세요.')
    throw new Error(`엑셀 파일을 읽지 못했습니다. ${DRM_HINT} (${msg})`)
  }
  return wb.SheetNames.map((n) => gridFromSheet(`${fileName}:${n}`, wb.Sheets[n]!))
}

export async function readWorkbookFile(file: File): Promise<CellGrid[]> {
  const buf = await file.arrayBuffer()
  return readWorkbookData(buf, file.name)
}
