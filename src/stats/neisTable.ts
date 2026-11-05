import { CHOICES, type Choice, type Exam, type Item, type Student } from '../model/types'
import type { Settings } from '../model/settings'
import { mcItemsOf } from './scoring'
import { partitionStudents } from './inclusion'

export interface NeisCountRow {
  no: number
  key: number[]
  counts: Record<Choice, number>
  sum: number
  blank: number
  multi: number
  p: number | null
}

/**
 * NEIS 문항분석표 방식의 집계.
 * NEIS는 복수표기를 표기한 답지마다 1씩 더하고 "중복표기" 열에도 세며, 무표기는 "무표기" 열에 센다.
 * (실제 NEIS 문항분석표의 학년 합계로 확인: 답지 합 = 학생 수 + 중복표기 학생 수)
 * 분석 탭의 답지반응률은 KICE 방식으로 무응답·중복을 한 칸에 모은다 — 둘은 의도적으로 다르다.
 */
export function neisCounts(exam: Exam, students: readonly Student[]): NeisCountRow[] {
  return neisCountsFor(mcItemsOf(exam), students)
}

/** 선다형 문항 목록(정오표 열 순서)으로 직접 집계 */
export function neisCountsFor(mc: readonly Item[], students: readonly Student[]): NeisCountRow[] {
  return mc.map((item, i) => {
    const counts: Record<Choice, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let blank = 0
    let multi = 0
    let correct = 0
    for (const s of students) {
      const r = s.responses[i]
      if (!r || r.k === 'blank') {
        blank++
        continue
      }
      if (r.k === 'correct') {
        correct++
        for (const k of item.key) if (CHOICES.includes(k as Choice)) counts[k as Choice]++
      } else if (r.k === 'wrong') {
        if (CHOICES.includes(r.choice as Choice)) counts[r.choice as Choice]++
      } else if (r.k === 'multi') {
        multi++
        for (const k of r.choices) if (CHOICES.includes(k as Choice)) counts[k as Choice]++
      } else {
        blank++
      }
    }
    const n = students.length
    return { no: item.no, key: item.key, counts, sum: n, blank, multi, p: n ? (100 * correct) / n : null }
  })
}

export interface NeisTableRow {
  no: number
  key: number[]
  /** "반(전체)" 형식 문자열 — 1번~5번 */
  cells: string[]
  sum: number
  keyText: string
  p: string
  blank: string
  multi: string
}

export interface NeisTable {
  classNo: string
  n: number
  /** 괄호 안 수치의 출처 설명 */
  gradeLabel: string
  usesReference: boolean
  rows: NeisTableRow[]
}

const f2 = (v: number | null | undefined) => (v == null ? '-' : v.toFixed(2))

/** 학년 전체 수치로 문항분석표를 쓸지 (설정에서 "올린 반이 학년 전체"를 고르면 올린 반 합계 사용) */
export function usesGradeReference(exam: Exam, settings: Pick<Settings, 'uploadedIsWholeGrade'>): boolean {
  return !!exam.gradeReference && !settings.uploadedIsWholeGrade
}

/** 한 반의 NEIS 문항분석표를 정오표로 다시 만든다. 괄호 안은 학년 전체(문항분석표) 또는 올린 반 합계. */
export function buildNeisTable(exam: Exam, classNo: string, settings: Pick<Settings, 'uploadedIsWholeGrade' | 'excludeNoResponse'>): NeisTable | null {
  const cls = exam.classes.find((c) => c.classNo === classNo)
  if (!cls) return null
  const own = partitionStudents(cls.students, settings).included
  const everyone = partitionStudents(
    exam.classes.flatMap((c) => c.students),
    settings,
  ).included
  const ownRows = neisCounts(exam, own)
  const allRows = neisCounts(exam, everyone)
  const useRef = usesGradeReference(exam, settings)
  const ref = exam.gradeReference
  const gradeN = useRef ? (ref!.items.find((i) => i.gradeN > 0)?.gradeN ?? null) : everyone.length
  const gradeLabel = useRef ? `학년 전체 ${gradeN ?? '?'}명 (문항분석표)` : settings.uploadedIsWholeGrade ? `학년 전체 ${everyone.length}명 (올린 반 합계)` : `올린 반 합계 ${everyone.length}명`
  const rows: NeisTableRow[] = ownRows.map((r, i) => {
    const g = allRows[i]!
    const gi = useRef ? ref!.items.find((x) => x.no === r.no) : undefined
    const gradeCount = (c: Choice) => (gi ? gi.gradeCounts[c] : g.counts[c])
    return {
      no: r.no,
      key: r.key,
      cells: CHOICES.map((c) => `${r.counts[c]}(${gradeCount(c)})`),
      sum: r.sum,
      keyText: r.key.join(','),
      p: `${f2(r.p)}(${f2(gi ? gi.gradeP : g.p)})`,
      blank: `${r.blank}(${gi ? gi.gradeBlank : g.blank})`,
      multi: `${r.multi}(${gi ? gi.gradeMulti : g.multi})`,
    }
  })
  return { classNo, n: own.length, gradeLabel, usesReference: useRef, rows }
}
