import { LEVELS, type AnalysisResult, type Bin, type Exam, type GroupStats, type ItemStats, type Level, type Student, type TopBottom, type Warning } from '../model/types'
import type { Settings } from '../model/settings'
import { meanSd } from './descriptive'
import { computeItemStats, topBottomItems } from './items'
import { basisPct, emptyLevelRecord, levelOf } from './levels'
import { alphaAll, alphaMc } from './reliability'
import { crItemsOf, mcItemsOf, scoreStudents, type Scored } from './scoring'
import { computeStandards } from './standards'
import { computeConstructed } from './constructed'
import { computeStudentResults } from './students'
import { describeStudent, partitionStudents } from './inclusion'

export const HISTOGRAM_BIN = 5

function groupStats(scored: readonly Scored[], levels: readonly Level[], settings: Settings): GroupStats {
  const counts = emptyLevelRecord(() => 0)
  for (const l of levels) counts[l]++
  const pctRec = emptyLevelRecord(() => 0)
  for (const l of LEVELS) pctRec[l] = scored.length ? (100 * counts[l]) / scored.length : 0
  return {
    n: scored.length,
    total: meanSd(scored.map((s) => s.total), settings.sdMode),
    mc: meanSd(scored.map((s) => s.mcScore), settings.sdMode),
    cr: meanSd(scored.map((s) => s.crScore), settings.sdMode),
    levelCounts: counts,
    levelPct: pctRec,
  }
}

function histogram(scored: readonly Scored[], levels: readonly Level[], exam: Exam, settings: Settings): Bin[] {
  const bins: Bin[] = []
  for (let from = 0; from < 100; from += HISTOGRAM_BIN) bins.push({ from, to: from + HISTOGRAM_BIN, count: 0, byLevel: emptyLevelRecord(() => 0) })
  scored.forEach((s, i) => {
    const p = basisPct(s, exam, settings)
    let idx = Math.floor(p / HISTOGRAM_BIN)
    if (idx >= bins.length) idx = bins.length - 1
    if (idx < 0) idx = 0
    bins[idx]!.count++
    bins[idx]!.byLevel[levels[i]!]++
  })
  return bins
}

export interface AnalyzeOptions {
  /** 분석에 포함할 반 (비우면 전체) */
  classFilter?: string[]
}

/** 시험 전체 분석. 순수 함수 — 설정이 바뀌면 다시 호출한다. */
export function analyze(exam: Exam, settings: Settings, opts: AnalyzeOptions = {}): AnalysisResult {
  const classes = opts.classFilter?.length ? exam.classes.filter((c) => opts.classFilter!.includes(c.classNo)) : exam.classes
  const part = partitionStudents(
    classes.flatMap((c) => c.students),
    settings,
  )
  const students: Student[] = part.included
  const scored = scoreStudents(exam, students, settings)
  const levels = scored.map((s) => levelOf(s, exam, settings))
  const warnings: Warning[] = []

  if (part.excluded.length) {
    const withScore = part.excluded.filter((s) => s.neis.total > 0).length
    warnings.push({
      level: 'warn',
      code: 'no-response-excluded',
      message: `선다형 응답이 하나도 없는 학생 ${part.excluded.length}명은 결시·미응시로 보고 분석에서 뺐습니다${withScore ? ` (그중 ${withScore}명은 점수만 있어 결시 인정점으로 보입니다)` : ''}. 포함하려면 설정에서 바꾸세요.`,
      details: part.excluded.map(describeStudent),
    })
  }
  if (part.noResponseIncluded.length) {
    warnings.push({
      level: 'info',
      code: 'no-response-included',
      message: `선다형 응답이 하나도 없는 학생 ${part.noResponseIncluded.length}명을 설정에 따라 분석에 포함했습니다.`,
      details: part.noResponseIncluded.map(describeStudent),
    })
  }
  if (students.length === 0) {
    warnings.push({ level: 'error', code: 'no-students', message: '분석할 학생이 없습니다. 올린 정오표와 학급 선택을 확인해 주세요.' })
  }

  const mismatched = scored.filter((s) => Math.abs(s.recomputed - s.student.neis.total) > 0.005)
  if (mismatched.length) {
    warnings.push({
      level: 'warn',
      code: 'score-mismatch',
      message: `NEIS 영역총점과 응답으로 계산한 점수가 다른 학생이 ${mismatched.length}명 있습니다. ${settings.scoreSource === 'neis' ? 'NEIS 점수' : '재계산 점수'}를 사용합니다.`,
      details: mismatched.slice(0, 20).map((s) => `${s.student.classNo}반 ${s.student.seatNo}번: NEIS ${s.student.neis.total} / 계산 ${s.recomputed}`),
    })
  }

  const overviewBase = groupStats(scored, levels, settings)
  const byClass: Record<string, GroupStats> = {}
  const itemsByClass: Record<string, ItemStats[]> = {}
  for (const c of classes) {
    const idx = scored.map((s, i) => (s.student.classNo === c.classNo ? i : -1)).filter((i) => i >= 0)
    const sub = idx.map((i) => scored[i]!)
    byClass[c.classNo] = groupStats(sub, idx.map((i) => levels[i]!), settings)
    itemsByClass[c.classNo] = computeItemStats(exam, sub)
  }
  const byLevel = {} as Record<Level, GroupStats>
  const itemsByLevel = {} as Record<Level, ItemStats[]>
  const topBottom = {} as Record<Level | 'all', TopBottom>
  for (const l of LEVELS) {
    const sub = scored.filter((_, i) => levels[i] === l)
    byLevel[l] = groupStats(sub, sub.map(() => l), settings)
    itemsByLevel[l] = computeItemStats(exam, sub)
    topBottom[l] = topBottomItems(itemsByLevel[l])
  }
  const items = computeItemStats(exam, scored)
  topBottom.all = topBottomItems(items)
  const { standards, domains } = computeStandards(exam, scored, levels, settings)

  return {
    itemCount: exam.items.length,
    mcCount: mcItemsOf(exam).length,
    crCount: crItemsOf(exam).length,
    classNos: classes.map((c) => c.classNo),
    overview: { ...overviewBase, alphaMc: alphaMc(scored), alphaAll: alphaAll(scored) },
    byClass,
    byLevel,
    histogram: histogram(scored, levels, exam, settings),
    items,
    itemsByLevel,
    itemsByClass,
    topBottom,
    standards,
    domains,
    constructed: computeConstructed(exam, scored, levels, settings),
    students: computeStudentResults(exam, scored, levels, items, settings),
    warnings,
  }
}
