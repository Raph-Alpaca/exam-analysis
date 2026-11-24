import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Tab 으로 갈 수 있는 요소 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 열려 있는 서랍 수. 하나라도 열려 있는 동안 뒤 화면이 같이 스크롤되지 않게 잠근다. */
let openCount = 0
let bodyOverflowBefore = ''
function lockScroll() {
  if (openCount++ === 0) {
    bodyOverflowBefore = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
function unlockScroll() {
  if (--openCount === 0) document.body.style.overflow = bodyOverflowBefore
}

export function Drawer({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 열리면 포커스를 서랍으로 옮기고, 닫히면 열기 전에 있던 곳(누른 행·단추)으로 돌려준다.
  useEffect(() => {
    if (!open) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus({ preventScroll: true })
    lockScroll()
    return () => {
      unlockScroll()
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  /** Tab 이 서랍 안에서만 돌게 한다 (끝에서 처음으로, 처음에서 끝으로) */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !ref.current) return
    const all = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    // 화면에 보이지 않는 요소는 뺀다 (크기를 계산하지 않는 환경에서는 모두 0이라 전부 그대로 쓴다)
    const shown = all.filter((el) => el.getClientRects().length > 0)
    const items = shown.length ? shown : all
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    // 내용이 넘쳐 스크롤되는 표는 브라우저가 Tab 으로 갈 수 있게 해 준다(키보드로 스크롤하라고).
    // 그런 표가 마지막 단추 뒤에 있으면 거기가 진짜 끝이므로, 표를 건너뛰고 처음으로 돌리지 않는다.
    const scrollers = [...ref.current.querySelectorAll<HTMLElement>('.table-scroll')].filter((el) => (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) && !el.querySelector(FOCUSABLE))
    const first = items[0]!
    const last = items[items.length - 1]!
    const lastScroller = scrollers[scrollers.length - 1]
    const end = lastScroller && last.compareDocumentPosition(lastScroller) & Node.DOCUMENT_POSITION_FOLLOWING ? lastScroller : last
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === end) {
      e.preventDefault()
      first.focus()
    } else if (!e.shiftKey && active === last) {
      // 마지막 단추 뒤에 스크롤되는 표가 있는 경우: 브라우저가 표로 옮겨 주도록 맡긴다.
      // 표에 Tab 이 가지 않는 브라우저에서는 포커스가 뒤 화면으로 빠지므로, 그때는 처음으로 데려온다.
      const drawer = ref.current
      setTimeout(() => {
        if (drawer.isConnected && !drawer.contains(document.activeElement)) first.focus()
      }, 0)
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={ref} className={`drawer${wide ? ' drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="drawer-head">
          <h2 id={titleId} style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="닫기">
            <Icon name="x" />
            닫기
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
