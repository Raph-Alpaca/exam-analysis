import { LEVELS, type Exam, type Item, type Level, type RateStats, type StandardStats } from '../model/types'
import type { Settings } from '../model/settings'
import { meanSd } from './descriptive'
import { crItemsOf, hasPerItemCr, mcItemsOf, type Scored } from './scoring'

interface ItemRef {
  item: Item
  earned: (s: Scored) => number
}

function rateStats(earned: number[], max: number, settings: Settings): RateStats {
  const raw = meanSd(earned, settings.sdMode)
  const scale = max > 0 ? 100 / max : 0
  return {
    n: earned.length,
    rate: raw.mean == null || max <= 0 ? null : (100 * raw.mean) / max,
    raw,
    scaled: { mean: raw.mean == null ? null : raw.mean * scale, sd: raw.sd == null ? null : raw.sd * scale },
  }
}

function buildStats(code: string, text: string, domain: string | undefined, refs: ItemRef[], scored: readonly Scored[], levels: readonly Level[], settings: Settings): StandardStats {
  const max = refs.reduce((a, r) => a + r.item.points, 0)
  const earnedOf = (s: Scored) => refs.reduce((a, r) => a + r.earned(s), 0)
  const all = scored.map(earnedOf)
  const byLevel = {} as Record<Level, RateStats>
  for (const l of LEVELS) {
    const xs = scored.filter((_, i) => levels[i] === l).map(earnedOf)
    byLevel[l] = rateStats(xs, max, settings)
  }
  const byClass: Record<string, RateStats> = {}
  const classNos = [...new Set(scored.map((s) => s.student.classNo))].sort((a, b) => Number(a) - Number(b))
  for (const c of classNos) byClass[c] = rateStats(scored.filter((s) => s.student.classNo === c).map(earnedOf), max, settings)
  return {
    code,
    text,
    domain,
    itemNos: refs.map((r) => r.item.no),
    maxPoints: max,
    overall: rateStats(all, max, settings),
    byLevel,
    byClass,
  }
}

/** 성취기준별·내용영역별 성취율 (전체 × 수준별 × 학급별) */
export function computeStandards(exam: Exam, scored: readonly Scored[], levels: readonly Level[], settings: Settings): { standards: StandardStats[]; domains: StandardStats[] } {
  const mc = mcItemsOf(exam)
  const cr = crItemsOf(exam)
  const perItemCr = hasPerItemCr(exam, scored)
  const refs: ItemRef[] = mc.map((item, i) => ({ item, earned: (s) => s.itemEarned[i] ?? 0 }))
  if (perItemCr) cr.forEach((item, j) => refs.push({ item, earned: (s) => s.crEarned[j] ?? 0 }))

  const standards = exam.standards
    .map((st) => {
      const mine = refs.filter((r) => r.item.standards.includes(st.code))
      if (mine.length === 0) return null
      return buildStats(st.code, st.text, st.domain, mine, scored, levels, settings)
    })
    .filter((x): x is StandardStats => x != null)

  const domainNames: string[] = []
  for (const r of refs) if (r.item.domain && !domainNames.includes(r.item.domain)) domainNames.push(r.item.domain)
  const domains = domainNames.map((d) =>
    buildStats(
      d,
      d,
      d,
      refs.filter((r) => r.item.domain === d),
      scored,
      levels,
      settings,
    ),
  )
  return { standards, domains }
}
