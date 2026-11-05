import type { CellGrid } from '../xlsx/readWorkbook'

export type FileKind = 'answers' | 'itemInfo' | 'answerKey' | 'itemAnalysis' | 'unknown'

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  answers: '교과목별 학생답 정오표',
  itemInfo: '문항정보표 (성취기준 포함)',
  answerKey: '문항정보표 (정답·배점 양식)',
  itemAnalysis: '문항분석표',
  unknown: '인식 불가',
}

/** 상단 12행의 텍스트로 파일 종류를 판별한다. */
export function detectKind(grid: CellGrid): FileKind {
  const parts: string[] = []
  const maxRow = Math.min(grid.rows, 12)
  for (let r = 1; r <= maxRow; r++) parts.push(grid.rowTexts(r).join(' '))
  const head = parts.join('\n').replace(/\s+/g, ' ')
  if (/학생\s*답\s*정오표/.test(head)) return 'answers'
  if (/문항\s*분석표/.test(head)) return 'itemAnalysis'
  if (/정답\s*\/\s*배점/.test(head)) return 'answerKey'
  if (/문\s*항\s*정\s*보\s*표/.test(head) || /이\s*원\s*목\s*적\s*분\s*류\s*표/.test(head)) return 'itemInfo'
  // 보조 판별: 헤더 구조로
  if (/반\s*\/\s*번호/.test(head) && /정답/.test(head) && /배점/.test(head)) return 'answers'
  if (/문항번호/.test(head) && /성취기준/.test(head)) return 'itemInfo'
  return 'unknown'
}
