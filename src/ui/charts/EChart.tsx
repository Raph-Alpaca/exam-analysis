import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, MarkLineComponentOption, TitleComponentOption, TooltipComponentOption } from 'echarts/components'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, SVGRenderer])

export type ChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | GridComponentOption | LegendComponentOption | MarkLineComponentOption | TitleComponentOption | TooltipComponentOption>

export const CHART_FONT = "'Pretendard Variable', Pretendard, system-ui, 'Malgun Gothic', sans-serif"

export function EChart({ option, height = 260, width, ariaLabel, className }: { option: ChartOption; height?: number; width?: number; ariaLabel: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'svg' })
    chart.setOption({ textStyle: { fontFamily: CHART_FONT }, animation: false, ...option }, true)
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [option])
  return <div ref={ref} className={className} style={{ height, width: width ?? '100%' }} role="img" aria-label={ariaLabel} />
}
