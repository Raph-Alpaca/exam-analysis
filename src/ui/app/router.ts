import { useEffect, useState } from 'react'

/** GitHub Pages 에는 SPA 폴백이 없으므로 해시 라우팅을 쓴다. */
export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/' + h
}

export function navigate(path: string): void {
  window.location.hash = path
}

export function useHashPath(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

/** '/results/:tab' 같은 패턴 매칭 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean)
  const parts = path.split('?')[0]!.split('/').filter(Boolean)
  if (pp.length !== parts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(parts[i]!)
      } catch {
        params[p.slice(1)] = parts[i]!
      }
    } else if (p !== parts[i]) return null
  }
  return params
}
