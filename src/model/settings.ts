export interface Cutoffs {
  AB: number
  BC: number
  CD: number
  DE: number
}

export interface Settings {
  cutoffs: Cutoffs
  /** 성취수준 산출 기준: 과목 만점 / 선다형 만점 */
  levelBasis: 'subjectMax' | 'mcMax'
  /** 총점 출처: NEIS 기록(영역총점) / 응답으로 재계산 */
  scoreSource: 'neis' | 'recomputed'
  /** 표준편차: 모집단(÷N, KICE 프로그램과 동일) / 표본(÷(N-1)) */
  sdMode: 'population' | 'sample'
  /** 학생 리포트에서 성취기준 "도달"로 보는 성취율(%) */
  standardPassPct: number
  /** 올린 반들이 학년 전체인지 (학년 전체 비교 열의 출처 결정) */
  uploadedIsWholeGrade: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  cutoffs: { AB: 90, BC: 80, CD: 70, DE: 60 },
  levelBasis: 'subjectMax',
  scoreSource: 'neis',
  sdMode: 'population',
  standardPassPct: 80,
  uploadedIsWholeGrade: false,
}

export function validateCutoffs(c: Cutoffs): string | null {
  const vals = [c.AB, c.BC, c.CD, c.DE]
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return '분할점수는 0~100 사이여야 합니다.'
  if (!(c.AB > c.BC && c.BC > c.CD && c.CD > c.DE)) return '분할점수는 A/B > B/C > C/D > D/E 순으로 내림차순이어야 합니다.'
  return null
}
