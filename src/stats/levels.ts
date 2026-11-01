import { LEVELS, type Exam, type Level } from '../model/types'
import type { Cutoffs, Settings } from '../model/settings'
import type { Scored } from './scoring'

const EPS = 1e-9

/** 성취수준 산출 기준 점수(%) */
export function basisPct(s: Scored, exam: Exam, settings: Settings): number {
  if (settings.levelBasis === 'mcMax') {
    const max = exam.maxima.mc > 0 ? exam.maxima.mc : 1
    return (100 * s.mcScore) / max
  }
  const max = exam.maxima.total > 0 ? exam.maxima.total : 1
  return (100 * s.total) / max
}

/** 분할점수 "이상"이면 해당 수준 (KICE·NEIS 규칙) */
export function assignLevel(pct: number, c: Cutoffs): Level {
  if (pct + EPS >= c.AB) return 'A'
  if (pct + EPS >= c.BC) return 'B'
  if (pct + EPS >= c.CD) return 'C'
  if (pct + EPS >= c.DE) return 'D'
  return 'E'
}

export function levelOf(s: Scored, exam: Exam, settings: Settings): Level {
  return assignLevel(basisPct(s, exam, settings), settings.cutoffs)
}

export function emptyLevelRecord<T>(make: () => T): Record<Level, T> {
  const out = {} as Record<Level, T>
  for (const l of LEVELS) out[l] = make()
  return out
}

/** 수준에 해당하는 분할점수 (리포트 표기용) */
export function cutoffFor(level: Level, c: Cutoffs): number | null {
  switch (level) {
    case 'A':
      return c.AB
    case 'B':
      return c.BC
    case 'C':
      return c.CD
    case 'D':
      return c.DE
    default:
      return null
  }
}
