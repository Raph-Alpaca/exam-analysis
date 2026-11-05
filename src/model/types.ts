/** 성취수준 (중학교: A~E) */
export type Level = 'A' | 'B' | 'C' | 'D' | 'E'
export const LEVELS: readonly Level[] = ['A', 'B', 'C', 'D', 'E'] as const

/** 문항정보표의 예상 난이도 */
export type Difficulty = '어려움' | '보통' | '쉬움'

export interface ExamHeader {
  year?: string // 학년도 (예: "2026")
  semester?: string // 학기 (예: "1")
  grade?: string // 학년 (예: "3")
  classNo?: string // 반 (정오표에만)
  examName?: string // 고사명 (예: "중간고사")
  subject?: string // 교과목 (예: "과학")
  raw: string
}

export type ItemKind = 'mc' | 'cr' // 선다형 / 서답형
/** single: 정답 1개, all: 복수표기 코드(모두 표기해야 정답), any: 복수구분(어느 하나면 정답) */
export type KeyMode = 'single' | 'all' | 'any'

export interface Item {
  no: number // 인쇄된 문항번호
  kind: ItemKind
  label: string // 표시용 ("1", "서답1")
  points: number
  key: number[] // 선다형 정답 선택지 (서답형은 빈 배열)
  keyMode: KeyMode
  difficulty?: Difficulty
  domain?: string // 내용영역
  standards: string[] // 성취기준 코드 (예: "[9과17-01]")
}

export interface Standard {
  code: string
  text: string
  domain?: string
  itemNos: number[]
}

export type Choice = 1 | 2 | 3 | 4 | 5
export type ChoiceKey = Choice | 'none'
export const CHOICES: readonly Choice[] = [1, 2, 3, 4, 5] as const

export type Response =
  | { k: 'correct' }
  | { k: 'wrong'; choice: number }
  | { k: 'blank' }
  | { k: 'multi'; choices: number[] }
  | { k: 'invalid'; raw: string }

export interface Student {
  id: string // 시험 내 고유값: "반/번호"
  classNo: string
  seatNo: number
  studentId: string // 학번 — 반드시 문자열
  name: string
  responses: Response[] // 선다형 문항 순서와 동일
  crScores?: number[] // 서답형 문항별 점수 (교사가 열을 추가한 경우)
  neis: { mc: number; cr: number; etc: number; total: number }
}

export interface ClassRoster {
  classNo: string
  header: ExamHeader
  students: Student[]
  source: { fileName: string }
}

export type WarningLevel = 'error' | 'warn' | 'info'
export interface Warning {
  level: WarningLevel
  code: string
  message: string
  details?: string[]
}

/** NEIS 문항분석표에서 읽은 반/학년 전체 수치 */
export interface GradeItemRef {
  no: number
  key: number | null
  /** 답지별 인원. none = 무표기 + 중복표기 */
  classCounts: Record<ChoiceKey, number>
  gradeCounts: Record<ChoiceKey, number>
  classBlank: number
  classMulti: number
  gradeBlank: number
  gradeMulti: number
  classN: number
  gradeN: number
  classP: number | null
  gradeP: number | null
}
export interface GradeReference {
  source: string
  header?: ExamHeader
  /** 문항분석표가 어느 반 것인지 (제목 행의 마지막 숫자) */
  classNo?: string
  items: GradeItemRef[]
  /** 같은 반 정오표와 반 수치를 대조해 모두 일치했는지 (정오표가 없으면 undefined) */
  verified?: boolean
}

export interface Exam {
  header: ExamHeader
  items: Item[]
  maxima: { mc: number; cr: number; etc: number; bonus: number; total: number }
  classes: ClassRoster[]
  standards: Standard[]
  hasItemInfo: boolean
  gradeReference?: GradeReference
  warnings: Warning[]
  sources: string[]
}

/* ---------- 분석 결과 ---------- */

export interface MeanSd {
  mean: number | null
  sd: number | null
}

export interface GroupStats {
  n: number
  total: MeanSd
  mc: MeanSd
  cr: MeanSd
  levelCounts: Record<Level, number>
  levelPct: Record<Level, number>
}

export type FlagCode =
  | 'low-p'
  | 'very-low-p'
  | 'low-disc'
  | 'neg-disc'
  | 'expect-mismatch'
  | 'expect-mismatch-strong'
  | 'high-none'
  | 'attractive-distractor'

export interface Flag {
  code: FlagCode
  severity: 'danger' | 'warn' | 'info'
  label: string
}

export interface ItemStats {
  no: number
  key: number[]
  points: number
  n: number
  p: number | null // 정답률(%)
  disc: number | null // 변별도 (수정 문항-총점 상관)
  counts: Record<ChoiceKey, number>
  pct: Record<ChoiceKey, number>
  blank: number
  multi: number
  invalid: number
  expected?: Difficulty
  observed3: Difficulty | null
  observed5: string | null
  flags: Flag[]
}

export interface RateStats {
  n: number
  rate: number | null // 성취율(%) = Σ획득 / Σ배점 × 100
  raw: MeanSd // 원점수
  scaled: MeanSd // 100점 환산
}

export interface StandardStats {
  code: string
  text: string
  domain?: string
  itemNos: number[]
  maxPoints: number
  overall: RateStats
  byLevel: Record<Level, RateStats>
  byClass: Record<string, RateStats>
}

export interface CrGroupStats extends MeanSd {
  n: number
  pct: number | null // 평균/배점×100
  dist: Record<string, number> // 점수값 → 비율(%)
}

export interface CrItemStats {
  no: number
  label: string
  points: number
  values: number[] // 관측된 점수값 (오름차순)
  overall: CrGroupStats
  byLevel: Record<Level, CrGroupStats>
}

export interface WrongItem {
  no: number
  response: Response
  key: number[]
  points: number
  domain?: string
  standards: string[]
  overallP: number | null
}

export interface StudentStandard {
  code: string
  text: string
  earned: number
  max: number
  rate: number
  status: '도달' | '부분' | '미도달'
}

export interface StudentResult {
  student: Student
  mcScore: number
  crScore: number
  total: number
  pct: number
  level: Level
  wrongItems: WrongItem[]
  standards: StudentStandard[]
}

export interface Bin {
  from: number
  to: number // 마지막 구간만 포함, 나머지는 미만
  count: number
  byLevel: Record<Level, number>
}

export interface TopBottom {
  top: number[]
  bottom: number[]
}

export interface AnalysisResult {
  itemCount: number
  mcCount: number
  crCount: number
  classNos: string[]
  overview: GroupStats & { alphaMc: number | null; alphaAll: number | null }
  byClass: Record<string, GroupStats>
  byLevel: Record<Level, GroupStats>
  histogram: Bin[]
  items: ItemStats[]
  itemsByLevel: Record<Level, ItemStats[]>
  itemsByClass: Record<string, ItemStats[]>
  topBottom: Record<Level | 'all', TopBottom>
  standards: StandardStats[]
  domains: StandardStats[]
  constructed: CrItemStats[]
  students: StudentResult[]
  warnings: Warning[]
}
