import type { ReactNode } from 'react'

/** 선 아이콘 (24×24, currentColor). 이모지는 컴퓨터마다 다르게 보여서 쓰지 않는다. */
const PATHS: Record<string, ReactNode> = {
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 14.5v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 14.5v3.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8.5V3.5h10v5" />
      <rect x="3.5" y="8.5" width="17" height="8" rx="2" />
      <path d="M7 13.5h10V20.5H7z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: (
    <>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M17.5 6.5 6.5 17.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.6 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.8h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.8h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5.5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  file: (
    <>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 13h6" />
      <path d="M9 16.5h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  spinner: <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />,
  sparkle: (
    <>
      <path d="M12 4v4" />
      <path d="M12 16v4" />
      <path d="M4 12h4" />
      <path d="M16 12h4" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg className={`icon${name === 'spinner' ? ' icon-spin' : ''}${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}

/** 사이트 표시: OMR 답안 칸 다섯 개 중 하나가 칠해진 모양 */
export function OmrMark({ size = 16 }: { size?: number }) {
  const r = 3.1
  return (
    <svg className="omr-mark" width={(size * 46) / 10} height={size} viewBox="0 0 46 10" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) =>
        i === 2 ? <circle key={i} cx={5 + i * 9} cy={5} r={r + 0.6} fill="var(--ink)" /> : <circle key={i} cx={5 + i * 9} cy={5} r={r} fill="none" stroke="var(--omr)" strokeWidth={1.3} />,
      )}
    </svg>
  )
}
