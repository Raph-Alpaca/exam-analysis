import type { CellGrid } from '../xlsx/readWorkbook'
import { detectKind, type FileKind } from './detect'
import { parseAnswerSheet } from './answerSheet'
import { parseItemInfo } from './itemInfo'
import { parseAnswerKey } from './answerKey'
import { parseItemAnalysis } from './itemAnalysis'
import type { ParsedFile } from './buildExam'

export { detectKind, FILE_KIND_LABEL, type FileKind } from './detect'
export { parseAnswerSheet } from './answerSheet'
export { parseItemInfo } from './itemInfo'
export { parseAnswerKey } from './answerKey'
export { parseItemAnalysis } from './itemAnalysis'
export { buildExam, type ParsedFile, type BuildResult } from './buildExam'
export { ParseError } from './errors'

/** 워크북의 시트들 중 인식되는 첫 시트를 골라 파싱 */
export function parseGrids(grids: CellGrid[], fileName: string): ParsedFile {
  let kind: FileKind = 'unknown'
  let grid: CellGrid | undefined
  for (const g of grids) {
    const k = detectKind(g)
    if (k !== 'unknown') {
      kind = k
      grid = g
      break
    }
  }
  if (!grid) return { fileName, kind: 'unknown', error: '정오표·문항정보표·정답배점표·문항분석표 중 어느 것인지 알 수 없는 파일입니다.' }
  try {
    switch (kind) {
      case 'answers':
        return { fileName, kind, answers: parseAnswerSheet(grid, fileName) }
      case 'itemInfo':
        return { fileName, kind, itemInfo: parseItemInfo(grid, fileName) }
      case 'answerKey':
        return { fileName, kind, answerKey: parseAnswerKey(grid, fileName) }
      case 'itemAnalysis':
        return { fileName, kind, itemAnalysis: parseItemAnalysis(grid, fileName) }
      default:
        return { fileName, kind, error: '알 수 없는 파일 종류' }
    }
  } catch (e) {
    return { fileName, kind, error: e instanceof Error ? e.message : String(e) }
  }
}
