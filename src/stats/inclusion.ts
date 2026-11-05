import type { Student } from '../model/types'
import type { Settings } from '../model/settings'

/**
 * 선다형 응답이 하나도 없는 학생(모두 무표기·빈칸·무효)이고 서답형 점수도 없으면
 * 결시·미응시(또는 점수만 있는 결시 인정점)로 본다.
 */
export function isNoResponse(st: Student): boolean {
  if (st.responses.length === 0) return false
  if (!st.responses.every((r) => r.k === 'blank' || r.k === 'invalid')) return false
  if (st.crScores?.some((v) => v > 0)) return false
  if (st.neis.cr > 0) return false
  return true
}

export interface Partition {
  included: Student[]
  /** 응답이 없어 분석에서 뺀 학생 */
  excluded: Student[]
  /** 응답이 없지만 설정에 따라 포함한 학생 */
  noResponseIncluded: Student[]
}

export function partitionStudents(students: readonly Student[], settings: Pick<Settings, 'excludeNoResponse'>): Partition {
  const included: Student[] = []
  const excluded: Student[] = []
  const noResponseIncluded: Student[] = []
  for (const s of students) {
    if (isNoResponse(s)) {
      if (settings.excludeNoResponse) excluded.push(s)
      else {
        included.push(s)
        noResponseIncluded.push(s)
      }
    } else included.push(s)
  }
  return { included, excluded, noResponseIncluded }
}

export function describeStudent(s: Student): string {
  return `${s.classNo}반 ${s.seatNo}번${s.name ? ` ${s.name}` : ''} (NEIS 총점 ${s.neis.total})`
}
