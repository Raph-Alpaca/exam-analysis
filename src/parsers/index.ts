import { DRM_HINT, type CellGrid } from '../xlsx/readWorkbook'
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

/** 워크북의 시트들 중 인식되는 첫 시트를 골라 파싱. 읽을 수 있는 시트가 더 있으면 읽지 않았다고 알린다. */
export function parseGrids(grids: CellGrid[], fileName: string): ParsedFile {
  let kind: FileKind = 'unknown'
  let grid: CellGrid | undefined
  const skipped: CellGrid[] = []
  for (const g of grids) {
    const k = detectKind(g)
    if (k === 'unknown') continue // 빈 시트·관계없는 시트
    if (!grid) {
      kind = k
      grid = g
    } else skipped.push(g)
  }
  if (!grid) return { fileName, kind: 'unknown', error: `교과목별 학생답 정오표·문항정보표·문항분석표가 아닌 파일입니다. NEIS에서 받은 파일이 맞다면 XLS data로 다시 저장했는지 확인해 주세요. ${DRM_HINT}` }
  try {
    let parsed: ParsedFile
    switch (kind) {
      case 'answers':
        parsed = { fileName, kind, answers: parseAnswerSheet(grid, fileName) }
        break
      case 'itemInfo':
        parsed = { fileName, kind, itemInfo: parseItemInfo(grid, fileName) }
        break
      case 'answerKey':
        parsed = { fileName, kind, answerKey: parseAnswerKey(grid, fileName) }
        break
      case 'itemAnalysis':
        parsed = { fileName, kind, itemAnalysis: parseItemAnalysis(grid, fileName) }
        break
      default:
        return { fileName, kind, error: '알 수 없는 파일 종류' }
    }
    const warnings = (parsed.answers ?? parsed.itemInfo ?? parsed.answerKey ?? parsed.itemAnalysis)!.warnings
    if (skipped.length > 0) {
      // CellGrid.name 은 "파일명:시트명"
      const sheetName = (g: CellGrid) => `"${g.name.slice(fileName.length + 1)}"`
      warnings.push({
        level: 'warn',
        code: 'other-sheets-ignored',
        message: `${fileName}: 시트가 여러 개인 파일이라 ${sheetName(grid)} 시트만 읽었습니다. ${skipped.map(sheetName).join(', ')} 시트는 읽지 않았으니, 시트마다 따로 파일로 저장해 올리거나 NEIS에서 받은 파일을 그대로 하나씩 올려 주세요.`,
      })
    }
    if (grid.errorCells > 0) {
      warnings.push({ level: 'warn', code: 'error-cells', message: `${fileName}: 수식 오류(#N/A, #VALUE! 등)가 있는 칸 ${grid.errorCells}개는 빈 칸으로 읽었습니다. 점수 칸이라면 값을 채워 다시 올려 주세요.` })
    }
    return parsed
  } catch (e) {
    return { fileName, kind, error: e instanceof Error ? e.message : String(e) }
  }
}
