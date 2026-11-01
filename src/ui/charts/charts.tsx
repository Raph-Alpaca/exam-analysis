import { useMemo } from 'react'
import { CHOICES, LEVELS, type Bin, type GroupStats, type ItemStats, type Level, type StandardStats } from '../../model/types'
import type { Cutoffs } from '../../model/settings'
import { LEVEL_COLORS, TONE_COLORS } from '../theme/levels'
import { EChart, type ChartOption } from './EChart'

const GRID = { left: 48, right: 16, top: 36, bottom: 32 }

/** 성취수준 색으로 쌓은 원점수(100점 환산) 히스토그램 + 분할점수 선 */
export function ScoreHistogram({ bins, cutoffs, height = 280, width }: { bins: Bin[]; cutoffs: Cutoffs; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = bins.map((b, i) => (i === bins.length - 1 ? `${b.from}~100` : `${b.from}~${b.to - 1}`))
    const cutIdx = (v: number) => Math.min(bins.length - 1, Math.floor(v / (bins[0]!.to - bins[0]!.from))) - 0.5
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, data: LEVELS.map((l) => `${l}`) },
      grid: GRID,
      xAxis: { type: 'category', data: cats, name: '점수(100점 환산)', nameLocation: 'middle', nameGap: 22, axisLabel: { fontSize: 10, interval: 1 } },
      yAxis: { type: 'value', name: '학생 수', minInterval: 1 },
      series: [
        ...LEVELS.map((l) => ({
          name: l,
          type: 'bar' as const,
          stack: 'lv',
          data: bins.map((b) => b.byLevel[l]),
          itemStyle: { color: LEVEL_COLORS[l] },
          barMaxWidth: 28,
          markLine:
            l === 'A'
              ? {
                  symbol: 'none' as const,
                  silent: true,
                  lineStyle: { color: '#6b7280', type: 'dashed' as const },
                  label: { formatter: '{b}', position: 'end' as const, fontSize: 10 },
                  data: [
                    { name: `A ${cutoffs.AB}`, xAxis: cutIdx(cutoffs.AB) },
                    { name: `B ${cutoffs.BC}`, xAxis: cutIdx(cutoffs.BC) },
                    { name: `C ${cutoffs.CD}`, xAxis: cutIdx(cutoffs.CD) },
                    { name: `D ${cutoffs.DE}`, xAxis: cutIdx(cutoffs.DE) },
                  ],
                }
              : undefined,
        })),
      ],
    }
  }, [bins, cutoffs])
  return <EChart option={option} height={height} width={width} ariaLabel="점수 분포 히스토그램 (성취수준별 색)" />
}

/** 집단(학급)별 성취수준 비율 누적 막대 */
export function LevelStackedBar({ groups, height = 260, width }: { groups: { name: string; stats: GroupStats }[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      legend: { top: 0 },
      grid: { ...GRID, left: 60 },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: groups.map((g) => g.name), inverse: true },
      series: LEVELS.map((l) => ({
        name: l,
        type: 'bar' as const,
        stack: 'lv',
        data: groups.map((g) => Math.round(g.stats.levelPct[l] * 10) / 10),
        itemStyle: { color: LEVEL_COLORS[l] },
        label: { show: true, formatter: (p) => (Number(p.value) >= 8 ? `${Number(p.value).toFixed(0)}%` : ''), color: l === 'C' || l === 'D' ? '#1f2937' : '#fff', fontSize: 11 },
        barMaxWidth: 26,
      })),
    }),
    [groups],
  )
  return <EChart option={option} height={height} width={width} ariaLabel="집단별 성취수준 비율" />
}

/** 한 문항의 답지반응률 — 전체 또는 성취수준별 묶음 막대 */
export function OptionResponseBar({ overall, byLevel, keyChoices, height = 240, width }: { overall: ItemStats; byLevel?: Record<Level, ItemStats>; keyChoices: number[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = [...CHOICES.map((c) => `${c}번${keyChoices.includes(c) ? ' (정답)' : ''}`), '무응답·중복']
    const values = (s: ItemStats) => [...CHOICES.map((c) => Math.round(s.pct[c] * 10) / 10), Math.round(s.pct.none * 10) / 10]
    const series = byLevel
      ? LEVELS.filter((l) => byLevel[l].n > 0).map((l) => ({ name: `${l} (${byLevel[l].n}명)`, type: 'bar' as const, data: values(byLevel[l]), itemStyle: { color: LEVEL_COLORS[l] }, barMaxWidth: 18 }))
      : [{ name: '전체', type: 'bar' as const, data: values(overall), itemStyle: { color: TONE_COLORS.accent }, barMaxWidth: 36 }]
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      legend: { top: 0 },
      grid: GRID,
      xAxis: { type: 'category', data: cats },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series,
    }
  }, [overall, byLevel, keyChoices])
  return <EChart option={option} height={height} width={width} ariaLabel="답지반응률" />
}

/** 문항별 정답률 막대 (전체) */
export function ItemAccuracyBar({ items, height = 240, width }: { items: ItemStats[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      grid: { ...GRID, top: 16 },
      xAxis: { type: 'category', data: items.map((i) => String(i.no)), name: '문항', nameLocation: 'middle', nameGap: 20 },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        {
          type: 'bar',
          data: items.map((i) => ({ value: i.p == null ? 0 : Math.round(i.p * 10) / 10, itemStyle: { color: i.p != null && i.p < 50 ? TONE_COLORS.warn : TONE_COLORS.accent } })),
          barMaxWidth: 22,
          markLine: { symbol: 'none' as const, silent: true, lineStyle: { color: TONE_COLORS.warn, type: 'dashed' as const }, data: [{ yAxis: 50, label: { formatter: '50%' } }] },
        },
      ],
    }),
    [items],
  )
  return <EChart option={option} height={height} width={width} ariaLabel="문항별 정답률" />
}

/** 성취기준(또는 내용영역)별 성취율 가로 막대 — 전체 + 선택 수준 */
export function StandardAchievementBar({ stats, byLevel, height, width }: { stats: StandardStats[]; byLevel?: boolean; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = stats.map((s) => (s.code.length > 18 ? s.code.slice(0, 17) + '…' : s.code))
    const series = byLevel
      ? LEVELS.map((l) => ({ name: l, type: 'bar' as const, data: stats.map((s) => (s.byLevel[l].rate == null ? null : Math.round(s.byLevel[l].rate! * 10) / 10)), itemStyle: { color: LEVEL_COLORS[l] }, barMaxWidth: 10 }))
      : [{ name: '전체', type: 'bar' as const, data: stats.map((s) => (s.overall.rate == null ? null : Math.round(s.overall.rate * 10) / 10)), itemStyle: { color: TONE_COLORS.accent }, barMaxWidth: 20, label: { show: true, position: 'right' as const, formatter: '{c}%', fontSize: 11 } }]
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (v == null ? '-' : `${Number(v).toFixed(1)}%`) },
      legend: byLevel ? { top: 0 } : undefined,
      grid: { left: 150, right: 40, top: byLevel ? 32 : 10, bottom: 28 },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLabel: { fontSize: 11 } },
      series,
    }
  }, [stats, byLevel])
  const h = height ?? Math.max(160, 30 + stats.length * (byLevel ? 60 : 28))
  return <EChart option={option} height={h} width={width} ariaLabel="성취기준별 성취율" />
}
