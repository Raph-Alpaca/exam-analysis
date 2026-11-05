import { useMemo } from 'react'
import { CHOICES, LEVELS, type Bin, type GroupStats, type ItemStats, type Level, type StandardStats } from '../../model/types'
import type { Cutoffs } from '../../model/settings'
import { LEVEL_COLORS, LEVEL_TEXT, TONE_COLORS } from '../theme/levels'
import { CHART_INK, EChart, type ChartOption } from './EChart'

/* 공통 모양: 가는 실선 격자, 눈금 표시 없음, 흐린 축 글자 */
const AXIS_LABEL = { color: CHART_INK.muted, fontSize: 11.5 }
const AXIS_LINE = { lineStyle: { color: CHART_INK.axis } }
const SPLIT_LINE = { lineStyle: { color: CHART_INK.grid } }
const LEGEND = { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: CHART_INK.secondary, fontSize: 12 } }
const AXIS_NAME = { color: CHART_INK.muted, fontSize: 11.5 }
const SHADOW_POINTER = { type: 'shadow' as const, shadowStyle: { color: 'rgba(23,33,58,0.05)' } }

/** 성취수준 색으로 쌓은 점수(100점 환산) 분포 + 분할점수 선 */
export function ScoreHistogram({ bins, cutoffs, height = 280, width }: { bins: Bin[]; cutoffs: Cutoffs; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = bins.map((b, i) => (i === bins.length - 1 ? `${b.from}~100` : `${b.from}~${b.to - 1}`))
    const cutIdx = (v: number) => Math.min(bins.length - 1, Math.floor(v / (bins[0]!.to - bins[0]!.from))) - 0.5
    return {
      tooltip: { trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v) => `${v}명` },
      legend: { ...LEGEND, data: LEVELS.map((l) => `${l}`) },
      grid: { left: 46, right: 16, top: 40, bottom: 40 },
      // 눈금 글자 간격은 ECharts가 차트 폭에 맞춰 정한다(좁은 화면에서 겹치지 않게)
      xAxis: { type: 'category', data: cats, name: '점수 (100점 환산)', nameLocation: 'middle', nameGap: 26, nameTextStyle: AXIS_NAME, axisLabel: { ...AXIS_LABEL, interval: 'auto', hideOverlap: true }, axisLine: AXIS_LINE, axisTick: { show: false } },
      // 축 제목(학생 수)은 범례와 겹치므로 카드 설명에 적고, 눈금에 '명'을 붙인다
      yAxis: { type: 'value', minInterval: 1, axisLabel: { ...AXIS_LABEL, formatter: '{value}명' }, splitLine: SPLIT_LINE },
      series: LEVELS.map((l) => ({
        name: l,
        type: 'bar' as const,
        stack: 'lv',
        data: bins.map((b) => b.byLevel[l]),
        itemStyle: { color: LEVEL_COLORS[l], borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 22,
        markLine:
          l === 'A'
            ? {
                symbol: 'none' as const,
                silent: true,
                lineStyle: { color: '#8b93a6', type: [4, 3] as number[], width: 1 },
                label: { formatter: '{b}', position: 'end' as const, color: CHART_INK.muted, fontSize: 11 },
                data: [
                  { name: `A ${cutoffs.AB}`, xAxis: cutIdx(cutoffs.AB) },
                  { name: `B ${cutoffs.BC}`, xAxis: cutIdx(cutoffs.BC) },
                  { name: `C ${cutoffs.CD}`, xAxis: cutIdx(cutoffs.CD) },
                  { name: `D ${cutoffs.DE}`, xAxis: cutIdx(cutoffs.DE) },
                ],
              }
            : undefined,
      })),
    }
  }, [bins, cutoffs])
  return <EChart option={option} height={height} width={width} ariaLabel="점수 분포 히스토그램 (성취수준별 색)" />
}

/** 집단(학급)별 성취수준 비율: 한 줄을 100%로 나눈 띠 */
export function LevelStackedBar({ groups, height = 260, width }: { groups: { name: string; stats: GroupStats }[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      legend: LEGEND,
      grid: { left: 48, right: 16, top: 36, bottom: 28 },
      xAxis: { type: 'value', max: 100, axisLabel: { ...AXIS_LABEL, formatter: '{value}%' }, splitLine: SPLIT_LINE },
      yAxis: { type: 'category', data: groups.map((g) => g.name), inverse: true, axisLabel: { ...AXIS_LABEL, color: CHART_INK.secondary, fontSize: 12.5 }, axisLine: { show: false }, axisTick: { show: false } },
      series: LEVELS.map((l) => ({
        name: l,
        type: 'bar' as const,
        stack: 'lv',
        data: groups.map((g) => Math.round(g.stats.levelPct[l] * 10) / 10),
        // 칸 사이 2px 흰 틈 (테두리 1px × 2)
        itemStyle: { color: LEVEL_COLORS[l], borderColor: CHART_INK.surface, borderWidth: 1, borderRadius: 3 },
        label: { show: true, formatter: (p) => (Number(p.value) >= 9 ? `${Number(p.value).toFixed(0)}%` : ''), color: LEVEL_TEXT[l], fontSize: 11.5, fontWeight: 600 },
        // 좁은 칸에 들어가지 않는 비율 글자는 숨긴다(값은 툴팁에 있음)
        labelLayout: { hideOverlap: true },
        barWidth: 22,
      })),
    }),
    [groups],
  )
  return <EChart option={option} height={height} width={width} ariaLabel="집단별 성취수준 비율" />
}

/** 한 문항의 답지반응률 — 전체 또는 성취수준별 묶음 막대 */
export function OptionResponseBar({ overall, byLevel, keyChoices, height = 250, width }: { overall: ItemStats; byLevel?: Record<Level, ItemStats>; keyChoices: number[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = [...CHOICES.map((c) => `${c}번${keyChoices.includes(c) ? ' (정답)' : ''}`), '무응답·중복']
    const values = (s: ItemStats) => [...CHOICES.map((c) => Math.round(s.pct[c] * 10) / 10), Math.round(s.pct.none * 10) / 10]
    const series = byLevel
      ? LEVELS.filter((l) => byLevel[l].n > 0).map((l) => ({ name: `${l} (${byLevel[l].n}명)`, type: 'bar' as const, data: values(byLevel[l]), itemStyle: { color: LEVEL_COLORS[l], borderRadius: [2, 2, 0, 0] }, barMaxWidth: 12 }))
      : [{ name: '전체', type: 'bar' as const, data: values(overall), itemStyle: { color: TONE_COLORS.accent, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 24 }]
    return {
      tooltip: { trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      legend: byLevel ? LEGEND : undefined,
      grid: { left: 40, right: 12, top: byLevel ? 36 : 14, bottom: 28 },
      xAxis: { type: 'category', data: cats, axisLabel: { ...AXIS_LABEL, color: CHART_INK.secondary }, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', max: 100, axisLabel: { ...AXIS_LABEL, formatter: '{value}%' }, splitLine: SPLIT_LINE },
      series,
    }
  }, [overall, byLevel, keyChoices])
  return <EChart option={option} height={height} width={width} ariaLabel="답지반응률" />
}

/** 문항별 정답률 막대 — 50% 미만은 주황 */
export function ItemAccuracyBar({ items, height = 240, width }: { items: ItemStats[]; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
      grid: { left: 40, right: 36, top: 14, bottom: 36 },
      xAxis: { type: 'category', data: items.map((i) => String(i.no)), name: '문항', nameLocation: 'middle', nameGap: 24, nameTextStyle: AXIS_NAME, axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false } },
      yAxis: { type: 'value', max: 100, axisLabel: { ...AXIS_LABEL, formatter: '{value}%' }, splitLine: SPLIT_LINE },
      series: [
        {
          type: 'bar',
          name: '정답률',
          data: items.map((i) => ({ value: i.p == null ? 0 : Math.round(i.p * 10) / 10, itemStyle: { color: i.p != null && i.p < 50 ? TONE_COLORS.low : TONE_COLORS.accent, borderRadius: [3, 3, 0, 0] } })),
          barMaxWidth: 18,
          markLine: { symbol: 'none' as const, silent: true, lineStyle: { color: '#8b93a6', type: [4, 3] as number[], width: 1 }, label: { formatter: '50%', color: CHART_INK.muted, fontSize: 11 }, data: [{ yAxis: 50 }] },
        },
      ],
    }),
    [items],
  )
  return <EChart option={option} height={height} width={width} ariaLabel="문항별 정답률" />
}

/** 성취기준(또는 내용영역)별 성취율 가로 막대 — 전체 또는 성취수준별 */
export function StandardAchievementBar({ stats, byLevel, height, width }: { stats: StandardStats[]; byLevel?: boolean; height?: number; width?: number }) {
  const option = useMemo<ChartOption>(() => {
    const cats = stats.map((s) => (s.code.length > 18 ? s.code.slice(0, 17) + '…' : s.code))
    const series = byLevel
      ? LEVELS.map((l) => ({ name: l, type: 'bar' as const, data: stats.map((s) => (s.byLevel[l].rate == null ? null : Math.round(s.byLevel[l].rate! * 10) / 10)), itemStyle: { color: LEVEL_COLORS[l], borderRadius: [0, 2, 2, 0] }, barMaxWidth: 8 }))
      : [
          {
            name: '전체',
            type: 'bar' as const,
            data: stats.map((s) => (s.overall.rate == null ? null : Math.round(s.overall.rate * 10) / 10)),
            itemStyle: { color: TONE_COLORS.accent, borderRadius: [0, 3, 3, 0] },
            barMaxWidth: 16,
            label: { show: true, position: 'right' as const, formatter: '{c}%', color: CHART_INK.secondary, fontSize: 11.5 },
          },
        ]
    return {
      tooltip: { trigger: 'axis', axisPointer: SHADOW_POINTER, valueFormatter: (v) => (v == null ? '-' : `${Number(v).toFixed(1)}%`) },
      legend: byLevel ? LEGEND : undefined,
      grid: { left: 140, right: 44, top: byLevel ? 34 : 8, bottom: 26 },
      xAxis: { type: 'value', max: 100, axisLabel: { ...AXIS_LABEL, formatter: '{value}%' }, splitLine: SPLIT_LINE },
      yAxis: { type: 'category', data: cats, inverse: true, axisLabel: { ...AXIS_LABEL, color: CHART_INK.secondary, fontSize: 11.5 }, axisLine: AXIS_LINE, axisTick: { show: false } },
      series,
    }
  }, [stats, byLevel])
  const h = height ?? Math.max(160, 40 + stats.length * (byLevel ? 58 : 28))
  return <EChart option={option} height={h} width={width} ariaLabel="성취기준별 성취율" />
}
