export interface Cutoffs {
  AB: number
  BC: number
  CD: number
  DE: number
}

/** 3단계(A·B·C) 교과의 분할점수 — 중학교 체육·음악·미술 */
export interface Cutoffs3 {
  AB: number
  BC: number
}

export type LevelScheme = 'five' | 'three'

export interface Settings {
  /** 성취수준 단계: 5단계(A~E) / 3단계(A~C) */
  levelScheme: LevelScheme
  cutoffs: Cutoffs
  cutoffs3: Cutoffs3
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
  /** 선다형 응답이 하나도 없는 학생(결시·미응시)을 분석에서 뺄지 */
  excludeNoResponse: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  levelScheme: 'five',
  cutoffs: { AB: 90, BC: 80, CD: 70, DE: 60 },
  cutoffs3: { AB: 80, BC: 60 },
  levelBasis: 'subjectMax',
  scoreSource: 'neis',
  sdMode: 'population',
  standardPassPct: 80,
  uploadedIsWholeGrade: false,
  excludeNoResponse: true,
}

export function validateCutoffs(c: Cutoffs): string | null {
  const vals = [c.AB, c.BC, c.CD, c.DE]
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return '분할점수는 0~100 사이여야 합니다.'
  if (!(c.AB > c.BC && c.BC > c.CD && c.CD > c.DE)) return '분할점수는 A/B > B/C > C/D > D/E 순으로 내림차순이어야 합니다.'
  return null
}

export function validateCutoffs3(c: Cutoffs3): string | null {
  const vals = [c.AB, c.BC]
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return '분할점수는 0~100 사이여야 합니다.'
  if (!(c.AB > c.BC)) return '분할점수는 A/B > B/C 순으로 내림차순이어야 합니다.'
  return null
}

/** 성취기준 "도달" 기준 성취율(%)로 쓸 수 있는 값인지 */
export function isValidPassPct(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100
}

/**
 * 브라우저에 저장돼 있던 설정에서 쓸 수 없는 값(0~100 밖이거나 순서가 뒤집힌 분할점수 등)을 기본값으로 되돌린다.
 * 예전에는 입력 칸을 비우면 0이 저장됐고, A/B 칸이 0이면 다음에 올린 시험까지 전원 A로 계산됐다.
 * 0이어도 형식상 올바른 칸(D/E, 3단계 B/C, 도달 기준)은 일부러 넣은 값과 구별할 수 없어 그대로 둔다.
 */
export function sanitizeSettings(s: Settings): Settings {
  return {
    ...s,
    cutoffs: validateCutoffs(s.cutoffs) ? { ...DEFAULT_SETTINGS.cutoffs } : s.cutoffs,
    cutoffs3: validateCutoffs3(s.cutoffs3) ? { ...DEFAULT_SETTINGS.cutoffs3 } : s.cutoffs3,
    standardPassPct: isValidPassPct(s.standardPassPct) ? s.standardPassPct : DEFAULT_SETTINGS.standardPassPct,
  }
}

/** 화면·보고서·엑셀에 쓰는 분할점수 표기: "A 90 / B 80 / C 70 / D 60" 또는 "A 80 / B 60" */
export function describeCutoffs(s: Pick<Settings, 'levelScheme' | 'cutoffs' | 'cutoffs3'>): string {
  if (s.levelScheme === 'three') return `A ${s.cutoffs3.AB} / B ${s.cutoffs3.BC}`
  return `A ${s.cutoffs.AB} / B ${s.cutoffs.BC} / C ${s.cutoffs.CD} / D ${s.cutoffs.DE}`
}

/** 분할점수 선(히스토그램 등)에 쓰는 [수준, 점수] 목록 */
export function cutoffMarks(s: Pick<Settings, 'levelScheme' | 'cutoffs' | 'cutoffs3'>): { level: 'A' | 'B' | 'C' | 'D'; value: number }[] {
  if (s.levelScheme === 'three')
    return [
      { level: 'A', value: s.cutoffs3.AB },
      { level: 'B', value: s.cutoffs3.BC },
    ]
  return [
    { level: 'A', value: s.cutoffs.AB },
    { level: 'B', value: s.cutoffs.BC },
    { level: 'C', value: s.cutoffs.CD },
    { level: 'D', value: s.cutoffs.DE },
  ]
}
