import { CHOICES, type Choice, type ChoiceKey, type Exam, type ItemStats } from '../model/types'
import { difficulty3, difficulty5, THRESHOLDS } from '../model/thresholds'
import { pearson } from './descriptive'
import { computeFlags } from './flags'
import { mcItemsOf, type Scored } from './scoring'

function emptyCounts(): Record<ChoiceKey, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, none: 0 }
}

/**
 * 선다형 문항 통계 (집단 단위).
 * - 정답률 분모 = 집단 전체(무응답 포함)
 * - 답지반응률: 정답(.)은 정답 선택지에 (복수정답이면 각 정답 선택지에) 가산, 무표기·복수표기·무효는 "무응답/중복"
 * - 변별도 = r(문항 획득점수, 집단총점 − 문항 획득점수), 집단총점 = 선다 + 서답 (KICE 프로그램과 동일)
 */
export function computeItemStats(exam: Exam, scored: readonly Scored[]): ItemStats[] {
  const mc = mcItemsOf(exam)
  const n = scored.length
  const groupTotal = scored.map((s) => s.mcScore + s.crScore)
  return mc.map((item, i) => {
    const counts = emptyCounts()
    let correct = 0
    let blank = 0
    let multi = 0
    let invalid = 0
    for (const s of scored) {
      const r = s.student.responses[i]
      if (!r) {
        blank++
        continue
      }
      switch (r.k) {
        case 'correct':
          correct++
          for (const k of item.key) if (k >= 1 && k <= 5) counts[k as Choice]++
          break
        case 'wrong':
          if (r.choice >= 1 && r.choice <= 5) counts[r.choice as Choice]++
          else invalid++
          break
        case 'blank':
          blank++
          break
        case 'multi':
          multi++
          break
        default:
          invalid++
      }
    }
    counts.none = blank + multi + invalid
    const pctRec = emptyCounts()
    for (const k of [...CHOICES, 'none'] as ChoiceKey[]) pctRec[k] = n > 0 ? (100 * counts[k]) / n : 0
    const p = n > 0 ? (100 * correct) / n : null
    let disc: number | null = null
    if (n >= THRESHOLDS.minGroupForDisc) {
      const x = scored.map((s) => s.itemEarned[i] ?? 0)
      const rest = groupTotal.map((t, si) => t - (x[si] ?? 0))
      disc = pearson(x, rest)
    }
    const base: Omit<ItemStats, 'flags'> = {
      no: item.no,
      key: item.key,
      points: item.points,
      n,
      p,
      disc,
      counts,
      pct: pctRec,
      blank,
      multi,
      invalid,
      expected: item.difficulty,
      observed3: difficulty3(p),
      observed5: difficulty5(p),
    }
    return { ...base, flags: computeFlags(base) }
  })
}

/** 정답률 상위/하위 k문항 (동률은 문항번호 순) */
export function topBottomItems(stats: readonly ItemStats[], k = 3): { top: number[]; bottom: number[] } {
  const valid = stats.filter((s) => s.p != null)
  const desc = [...valid].sort((a, b) => b.p! - a.p! || a.no - b.no)
  const asc = [...valid].sort((a, b) => a.p! - b.p! || a.no - b.no)
  return { top: desc.slice(0, k).map((s) => s.no), bottom: asc.slice(0, k).map((s) => s.no) }
}
