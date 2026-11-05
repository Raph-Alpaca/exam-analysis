import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { LabelLayout } from 'echarts/features'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, MarkLineComponentOption, TitleComponentOption, TooltipComponentOption } from 'echarts/components'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, SVGRenderer, LabelLayout])

export type ChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | GridComponentOption | LegendComponentOption | MarkLineComponentOption | TitleComponentOption | TooltipComponentOption>

export const CHART_FONT = "'IBM Plex Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif"

/** 차트 공통 잉크·괘선 (tokens.css 와 같은 값) */
export const CHART_INK = { primary: '#17213a', secondary: '#3d4760', muted: '#5b6478', grid: '#e9edf3', axis: '#c9d0db', surface: '#ffffff' } as const

/** 툴팁: 흰 바탕, 가는 테두리 */
const BASE_TOOLTIP = {
  backgroundColor: '#ffffff',
  borderColor: '#dde2ea',
  borderWidth: 1,
  padding: [8, 11],
  textStyle: { color: CHART_INK.primary, fontSize: 12.5, fontFamily: CHART_FONT },
  extraCssText: 'border-radius: 8px; box-shadow: 0 8px 22px rgba(23,33,58,0.12);',
}

export function EChart({ option, height = 260, width, ariaLabel, className }: { option: ChartOption; height?: number; width?: number; ariaLabel: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'svg' })
    const tooltip = option.tooltip && !Array.isArray(option.tooltip) ? { ...BASE_TOOLTIP, ...option.tooltip } : option.tooltip
    chart.setOption({ textStyle: { fontFamily: CHART_FONT, color: CHART_INK.muted }, animation: false, ...option, tooltip }, true)
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [option])
  return <div ref={ref} className={className} style={{ height, width: width ?? '100%' }} role="img" aria-label={ariaLabel} />
}
