import { LEVELS, type AnalysisResult, type Exam, type ItemStats, type Level } from '../../../model/types'
import { useAppStore } from '../../store/useAppStore'
import { fmt1, fmtInt } from '../../../model/format'
import { heatStyle, LEVEL_COLORS } from '../../theme/levels'
import { Badge, HeatLegend, KpiTile, LevelChip, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { itemColumns } from './ItemAnalysisTab'
import { ItemDetailDrawer } from './ItemDetailDrawer'

export type MatrixRow = { no: number; key: number[]; all: number | null; byLevel: Record<Level, number | null>; reversed: boolean }

export function levelMatrixRows(result: AnalysisResult): MatrixRow[] {
  return result.items.map((it) => {
    const byLevel = Object.fromEntries(LEVELS.map((l) => {
      const s = result.itemsByLevel[l].find((x) => x.no === it.no)
      return [l, s && s.n > 0 ? s.p : null]
    })) as Record<Level, number | null>
    // 높은 수준보다 낮은 수준의 정답률이 15%p 이상 높으면 역전 (두 집단 모두 5명 이상일 때만 판단)
    let reversed = false
    for (let i = 0; i < LEVELS.length; i++)
      for (let j = i + 1; j < LEVELS.length; j++) {
        const hi = byLevel[LEVELS[i]!]
        const lo = byLevel[LEVELS[j]!]
        const nHi = result.byLevel[LEVELS[i]!].n
        const nLo = result.byLevel[LEVELS[j]!].n
        if (hi != null && lo != null && nHi >= 5 && nLo >= 5 && lo > hi + 15) reversed = true
      }
    return { no: it.no, key: it.key, all: it.p, byLevel, reversed }
  })
}

export function levelMatrixColumns(result: AnalysisResult): Column<MatrixRow>[] {
  return [
    { id: 'no', header: '문항', accessor: (r) => r.no, align: 'center', sortable: true, width: 52 },
    { id: 'key', header: '정답', cell: (r) => r.key.join(',') || '-', align: 'center', width: 48 },
    { id: 'all', header: '전체', accessor: (r) => r.all, cell: (r) => fmt1(r.all), cellStyle: (r) => heatStyle(r.all), sortable: true },
    ...LEVELS.map(
      (l): Column<MatrixRow> => ({
        id: `l${l}`,
        header: `${l} (${result.byLevel[l].n}명)`,
        group: '성취수준별 정답률(%)',
        accessor: (r) => r.byLevel[l],
        cell: (r) => fmt1(r.byLevel[l]),
        cellStyle: (r) => heatStyle(r.byLevel[l]),
        sortable: true,
      }),
    ),
    { id: 'rev', header: '비고', cell: (r) => (r.reversed ? <Badge tone="warn">수준 역전</Badge> : null), accessor: (r) => (r.reversed ? 1 : 0), align: 'center', sortable: true },
  ]
}

function TopBottomCard({ title, nos, stats, tone }: { title: string; nos: number[]; stats: ItemStats[]; tone: 'good' | 'warn' }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <strong>{title}</strong>
      {nos.length === 0 ? (
        <div className="muted small">해당 없음</div>
      ) : (
        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          {nos.map((no) => {
            const s = stats.find((x) => x.no === no)
            return (
              <li key={no}>
                <strong>{no}번</strong> <span className="muted small">(정답 {s?.key.join(',') ?? '-'})</span> <Badge tone={tone}>{fmt1(s?.p)}%</Badge>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export function LevelAnalysisTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const selectedLevel = useAppStore((s) => s.ui.selectedLevel)
  const selectedItem = useAppStore((s) => s.ui.selectedItemNo)
  const setUi = useAppStore((s) => s.setUi)
  const lv = selectedLevel
  const group = lv === 'all' ? result.overview : result.byLevel[lv]
  const stats = lv === 'all' ? result.items : result.itemsByLevel[lv]
  const tb = result.topBottom[lv]
  const rows = levelMatrixRows(result)
  return (
    <div className="stack">
      <div className="filter-row">
        <span className="label" id="level-filter-label">
          성취수준
        </span>
        <div className="seg" role="group" aria-labelledby="level-filter-label">
          <button type="button" onClick={() => setUi({ selectedLevel: 'all' })} aria-pressed={lv === 'all'}>
            전체
          </button>
          {LEVELS.map((l) => (
            <button key={l} type="button" onClick={() => setUi({ selectedLevel: l })} aria-pressed={lv === l}>
              <span className="sw" style={{ background: LEVEL_COLORS[l] }} aria-hidden="true" />
              {l}
              <span className="count">{result.byLevel[l].n}명</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-kpi">
        <KpiTile label={lv === 'all' ? '전체 학생' : `성취수준 ${lv} 학생`} value={`${fmtInt(group.n)}명`} sub={lv === 'all' ? '' : `전체의 ${fmt1(result.overview.levelPct[lv])}%`} />
        <KpiTile label="평균" value={fmt1(group.total.mean)} sub={`표준편차 ${fmt1(group.total.sd)}`} />
        <KpiTile label="평균 정답률" value={`${fmt1(stats.length && group.n ? stats.reduce((a, s) => a + (s.p ?? 0), 0) / stats.length : null)}%`} sub={`${stats.length}문항`} />
      </div>

      {group.n > 0 ? (
        <div className="grid grid-2">
          <TopBottomCard title="정답률이 높은 3문항" nos={tb.top} stats={stats} tone="good" />
          <TopBottomCard title="정답률이 낮은 3문항" nos={tb.bottom} stats={stats} tone="warn" />
        </div>
      ) : (
        <div className="empty">이 수준에 해당하는 학생이 없습니다.</div>
      )}

      <section className="card">
        <SectionTitle title="문항 × 성취수준 정답률" right={<HeatLegend />}>
          정답률이 50%보다 낮으면 주황, 높으면 파랑으로 칠합니다. 낮은 수준의 정답률이 높은 수준보다 15%p 이상 높은 문항은 "수준 역전"으로 표시합니다(두 집단 모두 5명 이상일 때, 문항·답지 검토 필요). 행을 누르면 답지반응 상세.
        </SectionTitle>
        <DataTable columns={levelMatrixColumns(result)} rows={rows} rowKey={(r) => String(r.no)} onRowClick={(r) => setUi({ selectedItemNo: r.no })} selectedKey={selectedItem == null ? null : String(selectedItem)} compact />
      </section>

      {lv !== 'all' && group.n > 0 && (
        <section className="card">
          <SectionTitle
            title={
              <span className="row">
                <LevelChip level={lv} /> 수준 학생의 문항별 정답률·답지반응률
              </span>
            }
          >
            {group.n}명 기준. 변별도는 이 수준 안에서의 값(5명 미만이면 생략).
          </SectionTitle>
          <DataTable columns={itemColumns(exam, { compact: true })} rows={stats} rowKey={(r) => String(r.no)} onRowClick={(r) => setUi({ selectedItemNo: r.no })} compact />
        </section>
      )}
      <ItemDetailDrawer exam={exam} result={result} no={selectedItem} onClose={() => setUi({ selectedItemNo: null })} />
    </div>
  )
}
