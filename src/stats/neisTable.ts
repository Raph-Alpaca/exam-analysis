import { CHOICES, type Choice, type Exam, type Student } from '../model/types'
import { mcItemsOf } from './scoring'

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
 * (분석 탭의 답지반응률은 KICE 방식으로 무응답·중복을 한 칸에 모은다 — 둘은 의도적으로 다르다.)
 */
export function neisCounts(exam: Exam, students: readonly Student[]): NeisCountRow[] {
  const mc = mcItemsOf(exam)
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
