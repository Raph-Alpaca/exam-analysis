import { useRef, type KeyboardEvent } from 'react'

export interface TabDef {
  id: string
  label: string
  disabled?: boolean
  title?: string
}

export function Tabs({ tabs, active, onChange, ariaLabel }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0)
    const pos = enabled.indexOf(idx)
    let next = pos
    if (e.key === 'ArrowRight') next = (pos + 1) % enabled.length
    if (e.key === 'ArrowLeft') next = (pos - 1 + enabled.length) % enabled.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = enabled.length - 1
    const target = tabs[enabled[next]!]!
    onChange(target.id)
    const btn = ref.current?.querySelectorAll<HTMLButtonElement>('button[role=tab]')[enabled[next]!]
    btn?.focus()
  }
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel} ref={ref}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          className="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={`panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          disabled={t.disabled}
          title={t.title}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
