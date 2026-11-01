import { useEffect, type ReactNode } from 'react'

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className={`drawer${wide ? ' drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="drawer-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="닫기">
            ✕ 닫기
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
