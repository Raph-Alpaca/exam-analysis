import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

export interface Column<T> {
  id: string
  header: ReactNode
  /** 같은 group 값을 가진 연속 열은 위에 병합 헤더가 생김 */
  group?: string
  accessor?: (row: T) => number | string | null | undefined
  cell?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  width?: number | string
  cellClass?: (row: T) => string | undefined
  cellStyle?: (row: T) => CSSProperties | undefined
  headerTitle?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption?: ReactNode
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  rowClass?: (row: T) => string | undefined
  compact?: boolean
  /** 정렬 대상에서 제외하고 항상 맨 아래 두는 행 */
  footerRows?: T[]
  initialSort?: { id: string; dir: 'asc' | 'desc' }
  maxHeight?: string | number
  className?: string
}

function cmp(a: unknown, b: unknown): number {
  const an = a == null || a === '' ? null : a
  const bn = b == null || b === '' ? null : b
  if (an == null && bn == null) return 0
  if (an == null) return 1
  if (bn == null) return -1
  if (typeof an === 'number' && typeof bn === 'number') return an - bn
  return String(an).localeCompare(String(bn), 'ko', { numeric: true })
}

export function DataTable<T>({ columns, rows, rowKey, caption, onRowClick, selectedKey, rowClass, compact, footerRows, initialSort, maxHeight, className }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.accessor) return rows
    const acc = col.accessor
    const out = [...rows].sort((a, b) => cmp(acc(a), acc(b)))
    return sort.dir === 'asc' ? out : out.reverse()
  }, [rows, sort, columns])

  const groups: { label: string; span: number }[] = []
  let hasGroups = false
  for (const c of columns) {
    const last = groups[groups.length - 1]
    if (c.group && last && last.label === c.group) last.span++
    else groups.push({ label: c.group ?? '', span: 1 })
    if (c.group) hasGroups = true
  }

  const toggleSort = (c: Column<T>) => {
    if (!c.sortable || !c.accessor) return
    setSort((s) => (s?.id === c.id ? (s.dir === 'desc' ? { id: c.id, dir: 'asc' } : null) : { id: c.id, dir: 'desc' }))
  }

  const renderRow = (row: T, extraClass?: string) => {
    const key = rowKey(row)
    const classes = [extraClass, rowClass?.(row), onRowClick ? 'clickable' : '', selectedKey === key ? 'selected' : ''].filter(Boolean).join(' ')
    return (
      <tr key={key} className={classes || undefined} onClick={onRowClick ? () => onRowClick(row) : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}>
        {columns.map((c) => {
          const align = c.align ?? (c.accessor && typeof c.accessor(row) === 'number' ? 'right' : 'left')
          const cls = [align === 'right' ? 'num' : align === 'center' ? 'center' : '', c.cellClass?.(row)].filter(Boolean).join(' ')
          return (
            <td key={c.id} className={cls || undefined} style={c.cellStyle?.(row)}>
              {c.cell ? c.cell(row) : (c.accessor?.(row) ?? '')}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className={`table-scroll${className ? ` ${className}` : ''}`} style={maxHeight != null ? { maxHeight } : undefined}>
      <table className={`data${compact ? ' compact' : ''}`}>
        {caption && <caption>{caption}</caption>}
        <thead>
          {hasGroups && (
            <tr>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} scope="colgroup">
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={c.sortable && c.accessor ? 'sortable' : undefined}
                style={c.width != null ? { width: c.width, minWidth: c.width } : undefined}
                onClick={() => toggleSort(c)}
                aria-sort={sort?.id === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                title={c.headerTitle}
              >
                {c.header}
                {sort?.id === c.id && <span className="sort-ind">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => renderRow(r))}
          {footerRows?.map((r) => renderRow(r, 'total-row'))}
        </tbody>
      </table>
    </div>
  )
}
