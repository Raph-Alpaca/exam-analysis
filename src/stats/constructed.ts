import { LEVELS, type CrGroupStats, type CrItemStats, type Exam, type Level } from '../model/types'
import type { Settings } from '../model/settings'
import { meanSd } from './descriptive'
import { crItemsOf, hasPerItemCr, type Scored } from './scoring'

function groupStats(xs: number[], points: number, values: number[], settings: Settings): CrGroupStats {
  const ms = meanSd(xs, settings.sdMode)
  const dist: Record<string, number> = {}
  for (const v of values) dist[String(v)] = 0
  for (const x of xs) dist[String(x)] = (dist[String(x)] ?? 0) + 1
  for (const k of Object.keys(dist)) dist[k] = xs.length ? (100 * dist[k]!) / xs.length : 0
  return { n: xs.length, mean: ms.mean, sd: ms.sd, pct: ms.mean == null || points <= 0 ? null : (100 * ms.mean) / points, dist }
}

/** 서답형 문항별 통계 — 정오표에 문항별 열이 있을 때만 */
export function computeConstructed(exam: Exam, scored: readonly Scored[], levels: readonly Level[], settings: Settings): CrItemStats[] {
  if (!hasPerItemCr(exam, scored)) return []
  return crItemsOf(exam).map((item, j) => {
    const all = scored.map((s) => s.crEarned[j] ?? 0)
    const values = [...new Set(all)].sort((a, b) => a - b)
    const byLevel = {} as Record<Level, CrGroupStats>
    for (const l of LEVELS) byLevel[l] = groupStats(all.filter((_, i) => levels[i] === l), item.points, values, settings)
    return { no: item.no, label: item.label, points: item.points, values, overall: groupStats(all, item.points, values, settings), byLevel }
  })
}
