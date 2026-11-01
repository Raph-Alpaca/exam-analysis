import type { Exam, ItemStats, Level, StudentResult, StudentStandard, WrongItem } from '../model/types'
import type { Settings } from '../model/settings'
import { basisPct } from './levels'
import { crItemsOf, hasPerItemCr, mcItemsOf, type Scored } from './scoring'

export function computeStudentResults(exam: Exam, scored: readonly Scored[], levels: readonly Level[], itemStats: readonly ItemStats[], settings: Settings): StudentResult[] {
  const mc = mcItemsOf(exam)
  const cr = crItemsOf(exam)
  const perItemCr = hasPerItemCr(exam, scored)
  const pByNo = new Map(itemStats.map((s) => [s.no, s.p]))
  return scored.map((s, si) => {
    const wrongItems: WrongItem[] = []
    mc.forEach((item, i) => {
      const r = s.student.responses[i] ?? { k: 'blank' as const }
      if (r.k === 'correct') return
      wrongItems.push({ no: item.no, response: r, key: item.key, points: item.points, domain: item.domain, standards: item.standards, overallP: pByNo.get(item.no) ?? null })
    })
    const standards: StudentStandard[] = exam.standards.map((st) => {
      let earned = 0
      let max = 0
      mc.forEach((item, i) => {
        if (!item.standards.includes(st.code)) return
        max += item.points
        earned += s.itemEarned[i] ?? 0
      })
      if (perItemCr)
        cr.forEach((item, j) => {
          if (!item.standards.includes(st.code)) return
          max += item.points
          earned += s.crEarned[j] ?? 0
        })
      const rate = max > 0 ? (100 * earned) / max : 0
      const pass = settings.standardPassPct
      const status: StudentStandard['status'] = rate + 1e-9 >= pass ? '도달' : rate + 1e-9 >= Math.min(50, pass) ? '부분' : '미도달'
      return { code: st.code, text: st.text, earned, max, rate, status }
    })
    return {
      student: s.student,
      mcScore: s.mcScore,
      crScore: s.crScore,
      total: s.total,
      pct: basisPct(s, exam, settings),
      level: levels[si]!,
      wrongItems,
      standards: standards.filter((x) => x.max > 0),
    }
  })
}
