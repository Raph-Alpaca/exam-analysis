import type { Exam, Item, Student } from '../model/types'
import type { Settings } from '../model/settings'

export interface Scored {
  student: Student
  mcScore: number
  crScore: number
  etc: number
  /** 성취수준·평균에 쓰는 총점 (설정의 scoreSource 에 따름) */
  total: number
  recomputed: number
  /** 선다형 문항별 획득 점수 (0 또는 배점) */
  itemEarned: number[]
  /** 서답형 문항별 점수 (열이 있을 때만) */
  crEarned: number[]
}

export function mcItemsOf(exam: Exam): Item[] {
  return exam.items.filter((i) => i.kind === 'mc')
}
export function crItemsOf(exam: Exam): Item[] {
  return exam.items.filter((i) => i.kind === 'cr')
}

export function scoreStudents(exam: Exam, students: readonly Student[], settings: Settings): Scored[] {
  const mc = mcItemsOf(exam)
  const cr = crItemsOf(exam)
  return students.map((st) => {
    const itemEarned = mc.map((it, i) => (st.responses[i]?.k === 'correct' ? it.points : 0))
    const mcScore = itemEarned.reduce((a, b) => a + b, 0)
    const crEarned = st.crScores && st.crScores.length === cr.length ? [...st.crScores] : []
    const crScore = crEarned.length ? crEarned.reduce((a, b) => a + b, 0) : st.neis.cr
    const etc = st.neis.etc
    const recomputed = Math.round((mcScore + crScore + etc) * 100) / 100
    const total = settings.scoreSource === 'neis' ? st.neis.total : recomputed
    return { student: st, mcScore, crScore, etc, total, recomputed, itemEarned, crEarned }
  })
}

/** 서답형 문항별 점수가 모든 학생에게 있는지 */
export function hasPerItemCr(exam: Exam, scored: readonly Scored[]): boolean {
  const crCount = crItemsOf(exam).length
  return crCount > 0 && scored.length > 0 && scored.every((s) => s.crEarned.length === crCount)
}
