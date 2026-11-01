import { CHOICES, type Flag, type ItemStats } from '../model/types'
import { THRESHOLDS } from '../model/thresholds'

export function computeFlags(s: Omit<ItemStats, 'flags'>): Flag[] {
  const flags: Flag[] = []
  if (s.p != null) {
    if (s.p < THRESHOLDS.veryLowP) flags.push({ code: 'very-low-p', severity: 'danger', label: `정답률 ${THRESHOLDS.veryLowP}% 미만` })
    else if (s.p < THRESHOLDS.lowP) flags.push({ code: 'low-p', severity: 'warn', label: `정답률 ${THRESHOLDS.lowP}% 미만` })
  }
  if (s.disc != null) {
    if (s.disc < 0) flags.push({ code: 'neg-disc', severity: 'danger', label: '변별도 음수' })
    else if (s.disc < THRESHOLDS.lowDisc) flags.push({ code: 'low-disc', severity: 'warn', label: `변별도 ${THRESHOLDS.lowDisc} 미만` })
  }
  if (s.expected && s.observed3 && s.expected !== s.observed3) {
    const strong = (s.expected === '어려움' && s.observed3 === '쉬움') || (s.expected === '쉬움' && s.observed3 === '어려움')
    flags.push(
      strong
        ? { code: 'expect-mismatch-strong', severity: 'warn', label: `예상 ${s.expected} → 실제 ${s.observed3}` }
        : { code: 'expect-mismatch', severity: 'info', label: `예상 ${s.expected} → 실제 ${s.observed3}` },
    )
  }
  if (s.pct.none >= THRESHOLDS.highNonePct) flags.push({ code: 'high-none', severity: 'info', label: `무응답·중복 ${THRESHOLDS.highNonePct}% 이상` })
  const distractors = CHOICES.filter((c) => !s.key.includes(c) && s.pct[c] >= THRESHOLDS.attractiveDistractorPct)
  if (distractors.length) flags.push({ code: 'attractive-distractor', severity: 'info', label: `오답 ${distractors.join(',')}번 ${THRESHOLDS.attractiveDistractorPct}% 이상 선택` })
  return flags
}
