import type { CSSProperties, ReactNode } from 'react'
import type { Level, Warning } from '../../model/types'
import type { Band, Tone } from '../../model/thresholds'
import { HEAT_GRADIENT, LEVEL_COLORS, LEVEL_TEXT } from '../theme/levels'
import { Icon, type IconName } from './Icon'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone | 'accent'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  )
}

export function BandBadge({ band }: { band: Band | null }) {
  if (!band) return <span className="muted">-</span>
  return <Badge tone={band.tone}>{band.label}</Badge>
}

export function LevelChip({ level, large, style }: { level: Level; large?: boolean; style?: CSSProperties }) {
  return (
    <span className={`level-chip${large ? ' level-chip-lg' : ''}`} style={{ background: LEVEL_COLORS[level], color: LEVEL_TEXT[level], ...style }} aria-label={`성취수준 ${level}`}>
      {level}
    </span>
  )
}

export function KpiTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function InlineBar({ value, isKey, max = 100 }: { value: number | null | undefined; isKey?: boolean; max?: number }) {
  const v = value == null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(max, value))
  return (
    <span className={`inline-bar${isKey ? ' key' : ''}`} aria-hidden="true">
      <span style={{ width: `${(100 * v) / max}%` }} />
      <b>{value == null ? '-' : value.toFixed(1)}</b>
    </span>
  )
}

const CALLOUT_ICON: Record<'accent' | 'warn' | 'danger' | 'good', IconName> = { accent: 'info', warn: 'alert', danger: 'alert', good: 'check' }

export function Callout({ tone = 'accent', title, children }: { tone?: 'accent' | 'warn' | 'danger' | 'good'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`callout${tone === 'accent' ? '' : ` callout-${tone}`}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={CALLOUT_ICON[tone]} />
      <div className="callout-body">
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  )
}

/** 열지도 범례: 50%가 회색, 낮으면 주황, 높으면 파랑 */
export function HeatLegend({ label = '정답률' }: { label?: string }) {
  return (
    <span className="heat-legend" aria-label={`${label} 색: 50%는 회색, 낮을수록 주황, 높을수록 파랑`}>
      <span>{label} 낮음</span>
      <span className="bar" style={{ background: HEAT_GRADIENT }} aria-hidden="true" />
      <span>높음</span>
      <span className="muted">(가운데 50%)</span>
    </span>
  )
}

export function WarningList({ warnings, max = 8 }: { warnings: Warning[]; max?: number }) {
  if (warnings.length === 0) return null
  const errs = warnings.filter((w) => w.level === 'error')
  const warns = warnings.filter((w) => w.level === 'warn')
  const infos = warnings.filter((w) => w.level === 'info')
  const render = (list: Warning[], tone: 'danger' | 'warn' | 'accent') =>
    list.length > 0 && (
      <Callout tone={tone}>
        <ul className={list.length === 1 ? 'plain' : undefined}>
          {list.slice(0, max).map((w, i) => (
            <li key={`${w.code}-${i}`}>
              {w.message}
              {w.details && w.details.length > 0 && (
                <details>
                  <summary className="small">자세히 ({w.details.length})</summary>
                  <ul>
                    {w.details.slice(0, 30).map((d, j) => (
                      <li key={j} className="small">
                        {d}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
          {list.length > max && <li className="muted small">… 외 {list.length - max}건</li>}
        </ul>
      </Callout>
    )
  return (
    <div className="stack-sm">
      {render(errs, 'danger')}
      {render(warns, 'warn')}
      {render(infos, 'accent')}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function LevelLegend({ extra }: { extra?: ReactNode }) {
  return (
    <div className="legend-list" aria-label="성취수준 색 범례">
      {(['A', 'B', 'C', 'D', 'E'] as Level[]).map((l) => (
        <span key={l}>
          <span className="sw" style={{ background: LEVEL_COLORS[l] }} />
          {l}
        </span>
      ))}
      {extra}
    </div>
  )
}

export function SectionTitle({ title, right, children }: { title: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-title">
      <div>
        <h3>{title}</h3>
        {children && <div className="muted small">{children}</div>}
      </div>
      {right}
    </div>
  )
}
