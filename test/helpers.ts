import * as XLSX from 'xlsx'
import { CellGrid, gridFromSheet, readWorkbookData } from '../src/xlsx/readWorkbook'
import type { Aoa } from './fixtures/neis.ts'

export interface AoaOptions {
  /** `_1` 양식처럼 `<dimension ref="A1">`이 잘못된 시트 흉내 (쓰기 시 셀이 잘리므로 시트 객체에서 직접 그리드 생성) */
  bogusRef?: boolean
  merges?: XLSX.Range[]
  sheetName?: string
}

/** AOA → 실제 xlsx 바이트 → CellGrid (리더까지 실제로 통과) */
export async function gridFromAoa(aoa: Aoa, opts: AoaOptions = {}): Promise<CellGrid> {
  const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number | null)[][])
  if (opts.merges) ws['!merges'] = opts.merges
  if (opts.bogusRef) {
    ws['!ref'] = 'A1'
    return gridFromSheet('fixture.xlsx:sheet1', ws)
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName ?? 'sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const grids = await readWorkbookData(buf, 'fixture.xlsx')
  return grids[0]!
}

export function aoaToXlsxBuffer(aoa: Aoa, sheetName = 'sheet1', merges?: XLSX.Range[]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number | null)[][])
  if (merges) ws['!merges'] = merges
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
