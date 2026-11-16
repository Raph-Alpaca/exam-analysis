import { LEVELS, type Exam, type Level } from '../model/types'
import type { Cutoffs, Cutoffs3, Settings } from '../model/settings'
import type { Scored } from './scoring'

const EPS = 1e-9
const LEVELS3: readonly Level[] = ['A', 'B', 'C']

/** 설정된 단계에서 실제로 쓰는 성취수준 (5단계 A~E / 3단계 A~C). 화면·보고서는 이 목록만 보여 준다. */
export function activeLevels(settings: Pick<Settings, 'levelScheme'>): readonly Level[] {
  return settings.levelScheme === 'three' ? LEVELS3 : LEVELS
}

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

/** 3단계 교과(체육·음악·미술): A/B, B/C 분할점수만 쓴다 */
export function assignLevel3(pct: number, c: Cutoffs3): Level {
  if (pct + EPS >= c.AB) return 'A'
  if (pct + EPS >= c.BC) return 'B'
  return 'C'
}

export function levelOf(s: Scored, exam: Exam, settings: Settings): Level {
  const pct = basisPct(s, exam, settings)
  return settings.levelScheme === 'three' ? assignLevel3(pct, settings.cutoffs3) : assignLevel(pct, settings.cutoffs)
}

export function emptyLevelRecord<T>(make: () => T): Record<Level, T> {
  const out = {} as Record<Level, T>
  for (const l of LEVELS) out[l] = make()
  return out
}

/** 수준에 해당하는 분할점수 (리포트 표기용) */
export function cutoffFor(level: Level, settings: Pick<Settings, 'levelScheme' | 'cutoffs' | 'cutoffs3'>): number | null {
  if (settings.levelScheme === 'three') return level === 'A' ? settings.cutoffs3.AB : level === 'B' ? settings.cutoffs3.BC : null
  const c = settings.cutoffs
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
