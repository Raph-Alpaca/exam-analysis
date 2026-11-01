import { CHOICES, LEVELS, type AnalysisResult, type Exam, type ItemStats, type Level } from '../../../model/types'
import { discBand } from '../../../model/thresholds'
import { fmt1, fmt2, fmtInt, fmtPoints } from '../../../model/format'
import { pShadeClass } from '../../theme/levels'
import { Badge, LevelChip } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { OptionResponseBar } from '../../charts/charts'

export function ItemDetailDrawer({ exam, result, no, onClose }: { exam: Exam; result: AnalysisResult; no: number | null; onClose: () => void }) {
  const item = exam.items.find((i) => i.no === no && i.kind === 'mc')
  const stat = result.items.find((s) => s.no === no)
  if (!item || !stat || no == null) return null
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, result.itemsByLevel[l].find((s) => s.no === no)!])) as Record<Level, ItemStats>
  type Row = { label: string; level?: Level; s: ItemStats }
  const rows: Row[] = LEVELS.map((l) => ({ label: l, level: l, s: byLevel[l] }))
  const cols: Column<Row>[] = [
    { id: 'lv', header: '성취수준', cell: (r) => (r.level ? <LevelChip level={r.level} /> : <strong>{r.label}</strong>), align: 'center' },
    { id: 'n', header: '학생 수', accessor: (r) => r.s.n, cell: (r) => fmtInt(r.s.n) },
    { id: 'p', header: '정답률(%)', accessor: (r) => r.s.p, cell: (r) => <strong>{fmt1(r.s.n ? r.s.p : null)}</strong>, cellClass: (r) => (r.s.n ? pShadeClass(r.s.p) : undefined) },
    ...CHOICES.map((c): Column<Row> => ({ id: `o${c}`, header: String(c), group: '답지반응률(%)', accessor: (r) => r.s.pct[c], cell: (r) => fmt1(r.s.n ? r.s.pct[c] : null), cellClass: () => (item.key.includes(c) ? 'key' : undefined) })),
    { id: 'none', header: '무응답·중복', group: '답지반응률(%)', accessor: (r) => r.s.pct.none, cell: (r) => fmt1(r.s.n ? r.s.pct.none : null) },
  ]
  type CRow = { name: string; s: ItemStats }
  const crows: CRow[] = result.classNos.map((c) => ({ name: `${c}반`, s: result.itemsByClass[c]!.find((s) => s.no === no)! }))
  const ccols: Column<CRow>[] = [
    { id: 'name', header: '학급', accessor: (r) => r.name, align: 'center' },
    { id: 'n', header: '학생 수', accessor: (r) => r.s.n },
    { id: 'p', header: '정답률(%)', accessor: (r) => r.s.p, cell: (r) => fmt1(r.s.p), cellClass: (r) => pShadeClass(r.s.p) },
    { id: 'disc', header: '변별도', accessor: (r) => r.s.disc, cell: (r) => fmt2(r.s.disc) },
    ...CHOICES.map((c): Column<CRow> => ({ id: `o${c}`, header: String(c), group: '답지반응률(%)', accessor: (r) => r.s.pct[c], cell: (r) => fmt1(r.s.pct[c]), cellClass: () => (item.key.includes(c) ? 'key' : undefined) })),
    { id: 'none', header: '무응답·중복', group: '답지반응률(%)', accessor: (r) => r.s.pct.none, cell: (r) => fmt1(r.s.pct.none) },
  ]
  const standards = exam.standards.filter((s) => item.standards.includes(s.code))
  return (
    <Drawer open onClose={onClose} title={`문항 ${item.no}`} wide>
      <div className="stack">
        <div className="row">
          <Badge tone="accent">정답 {item.key.join(',') || '-'}</Badge>
          <Badge>배점 {fmtPoints(item.points)}</Badge>
          {item.difficulty && <Badge>예상 {item.difficulty}</Badge>}
          {stat.observed3 && <Badge>실제 {stat.observed3}</Badge>}
          {item.domain && <Badge>{item.domain}</Badge>}
          <Badge tone={discBand(stat.disc)?.tone ?? 'neutral'}>변별도 {fmt2(stat.disc)}</Badge>
          {stat.flags.map((f) => (
            <Badge key={f.code} tone={f.severity === 'danger' ? 'danger' : f.severity === 'warn' ? 'warn' : 'neutral'}>
              {f.label}
            </Badge>
          ))}
        </div>
        {standards.length > 0 && (
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {standards.map((s) => (
              <li key={s.code}>
                <strong>{s.code}</strong> {s.text}
              </li>
            ))}
          </ul>
        )}
        <OptionResponseBar overall={stat} byLevel={byLevel} keyChoices={item.key} />
        <DataTable columns={cols} rows={rows} footerRows={[{ label: '전체', s: stat }]} rowKey={(r) => r.label} caption="성취수준별 정답률·답지반응률" compact />
        {crows.length > 1 && <DataTable columns={ccols} rows={crows} footerRows={[{ name: '전체', s: stat }]} rowKey={(r) => r.name} caption="학급별" compact />}
      </div>
    </Drawer>
  )
}
