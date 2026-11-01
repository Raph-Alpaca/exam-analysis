import { LEVELS, type AnalysisResult, type CrGroupStats, type CrItemStats, type Exam, type Level } from '../../../model/types'
import { fmt1, fmtInt, fmtPoints } from '../../../model/format'
import { heatStyle } from '../../theme/levels'
import { Callout, EmptyState, KpiTile, LevelChip, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'

type Row = { label: string; level?: Level; g: CrGroupStats }

export function crColumns(item: CrItemStats): Column<Row>[] {
  return [
    { id: 'lv', header: '성취수준', cell: (r) => (r.level ? <LevelChip level={r.level} /> : <strong>{r.label}</strong>), align: 'center' },
    { id: 'n', header: '학생 수', accessor: (r) => r.g.n, cell: (r) => fmtInt(r.g.n) },
    { id: 'mean', header: '평균', accessor: (r) => r.g.mean, cell: (r) => fmt1(r.g.mean) },
    { id: 'sd', header: '표준편차', accessor: (r) => r.g.sd, cell: (r) => fmt1(r.g.sd) },
    { id: 'pct', header: '100점 환산', accessor: (r) => r.g.pct, cell: (r) => fmt1(r.g.pct), cellStyle: (r) => heatStyle(r.g.pct) },
    ...item.values.map(
      (v): Column<Row> => ({ id: `v${v}`, header: `${fmtPoints(v)}점`, group: '점수별 학생 비율(%)', accessor: (r) => r.g.dist[String(v)] ?? 0, cell: (r) => fmt1(r.g.n ? (r.g.dist[String(v)] ?? 0) : null) }),
    ),
  ]
}

export function CrItemCard({ item }: { item: CrItemStats }) {
  const rows: Row[] = LEVELS.map((l) => ({ label: l, level: l, g: item.byLevel[l] }))
  return (
    <section className="card">
      <SectionTitle title={`${item.label} (배점 ${fmtPoints(item.points)})`}>
        평균 {fmt1(item.overall.mean)} · 표준편차 {fmt1(item.overall.sd)} · 100점 환산 {fmt1(item.overall.pct)}
      </SectionTitle>
      <DataTable columns={crColumns(item)} rows={rows} footerRows={[{ label: '전체', g: item.overall }]} rowKey={(r) => r.label} compact />
    </section>
  )
}

export function ConstructedTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  if (exam.maxima.cr <= 0 && result.constructed.length === 0) {
    return <EmptyState>이 시험에는 서답형 문항이 없습니다 (서답형 만점 0점).</EmptyState>
  }
  const o = result.overview
  return (
    <div className="stack">
      <div className="grid grid-kpi">
        <KpiTile label={`서답형 평균 (${exam.maxima.cr}점 만점)`} value={fmt1(o.cr.mean)} sub={`표준편차 ${fmt1(o.cr.sd)}`} />
        <KpiTile label="100점 환산" value={fmt1(o.cr.mean == null ? null : (100 * o.cr.mean) / exam.maxima.cr)} />
        <KpiTile label="문항별 분석" value={result.constructed.length ? `${result.constructed.length}문항` : '없음'} sub={result.constructed.length ? '정오표에 문항별 열 있음' : 'NEIS 총점만 있음'} />
      </div>
      <section className="card">
        <SectionTitle title="성취수준별 서답형 총점">정오표의 서답형점수 열 기준</SectionTitle>
        <DataTable
          columns={[
            { id: 'lv', header: '성취수준', cell: (r) => (r.level ? <LevelChip level={r.level} /> : <strong>{r.label}</strong>), align: 'center' },
            { id: 'n', header: '학생 수', accessor: (r) => r.n, cell: (r) => fmtInt(r.n) },
            { id: 'mean', header: '평균', accessor: (r) => r.mean, cell: (r) => fmt1(r.mean) },
            { id: 'sd', header: '표준편차', accessor: (r) => r.sd, cell: (r) => fmt1(r.sd) },
            { id: 'pct', header: '100점 환산', accessor: (r) => r.pct, cell: (r) => fmt1(r.pct), cellStyle: (r) => heatStyle(r.pct) },
          ]}
          rows={LEVELS.map((l) => ({ label: l as string, level: l as Level | undefined, n: result.byLevel[l].n, mean: result.byLevel[l].cr.mean, sd: result.byLevel[l].cr.sd, pct: result.byLevel[l].cr.mean == null ? null : (100 * result.byLevel[l].cr.mean!) / exam.maxima.cr }))}
          footerRows={[{ label: '전체', level: undefined, n: o.n, mean: o.cr.mean, sd: o.cr.sd, pct: o.cr.mean == null ? null : (100 * o.cr.mean) / exam.maxima.cr }]}
          rowKey={(r) => r.label}
          compact
        />
      </section>
      {result.constructed.length === 0 ? (
        <Callout tone="warn" title="문항별 서답형 분석을 보려면">
          <p className="small" style={{ margin: '4px 0 0' }}>
            NEIS 정오표에는 서답형 총점만 있습니다. 정오표 엑셀에서 마지막 선다형 문항과 "선택형점수" 열 사이에 <code>서답1, 서답2 …</code> 열을 추가하고 배점 행과 학생별 점수를 채워 다시 올리면 문항별 평균·점수 분포·성취수준별 분석이 나옵니다.
          </p>
        </Callout>
      ) : (
        result.constructed.map((item) => <CrItemCard key={item.label} item={item} />)
      )}
    </div>
  )
}
