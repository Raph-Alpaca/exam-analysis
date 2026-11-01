import { LEVELS, type AnalysisResult, type Exam, type GroupStats, type Level } from '../../../model/types'
import { useAppStore } from '../../store/useAppStore'
import { alphaBand } from '../../../model/thresholds'
import { fmt1, fmt3, fmtInt } from '../../../model/format'
import { BandBadge, KpiTile, LevelChip, LevelLegend, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { LevelStackedBar, ScoreHistogram } from '../../charts/charts'

type LevelRow = { label: string; level?: Level; g: GroupStats; share: number | null }

export function LevelStatsTable({ result, exam, caption }: { result: AnalysisResult; exam: Exam; caption?: string }) {
  const hasCr = exam.maxima.cr > 0
  const total = result.overview.n
  const rows: LevelRow[] = LEVELS.map((l) => ({ label: l, level: l, g: result.byLevel[l], share: total ? (100 * result.byLevel[l].n) / total : null }))
  const footer: LevelRow[] = [{ label: '전체', g: result.overview, share: 100 }]
  const cols: Column<LevelRow>[] = [
    { id: 'lv', header: '성취수준', cell: (r) => (r.level ? <LevelChip level={r.level} /> : <strong>{r.label}</strong>), align: 'center' },
    { id: 'n', header: '학생 수', accessor: (r) => r.g.n, cell: (r) => fmtInt(r.g.n) },
    { id: 'share', header: '비율(%)', accessor: (r) => r.share, cell: (r) => fmt1(r.share) },
    { id: 'mcm', header: `평균`, group: `선다형(${exam.maxima.mc})`, accessor: (r) => r.g.mc.mean, cell: (r) => fmt1(r.g.mc.mean) },
    { id: 'mcs', header: '표준편차', group: `선다형(${exam.maxima.mc})`, accessor: (r) => r.g.mc.sd, cell: (r) => fmt1(r.g.mc.sd) },
    ...(hasCr
      ? ([
          { id: 'crm', header: '평균', group: `서답형(${exam.maxima.cr})`, accessor: (r) => r.g.cr.mean, cell: (r) => fmt1(r.g.cr.mean) },
          { id: 'crs', header: '표준편차', group: `서답형(${exam.maxima.cr})`, accessor: (r) => r.g.cr.sd, cell: (r) => fmt1(r.g.cr.sd) },
        ] as Column<LevelRow>[])
      : []),
    { id: 'tm', header: '평균', group: `전체(${exam.maxima.total})`, accessor: (r) => r.g.total.mean, cell: (r) => fmt1(r.g.total.mean) },
    { id: 'ts', header: '표준편차', group: `전체(${exam.maxima.total})`, accessor: (r) => r.g.total.sd, cell: (r) => fmt1(r.g.total.sd) },
  ]
  return <DataTable columns={cols} rows={rows} footerRows={footer} rowKey={(r) => r.label} caption={caption} compact />
}

export function OverviewTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const settings = useAppStore((s) => s.settings)
  const o = result.overview
  const groups = [{ name: '전체', stats: o }, ...result.classNos.map((c) => ({ name: `${c}반`, stats: result.byClass[c]! }))]
  return (
    <div className="stack">
      <div className="grid grid-kpi">
        <KpiTile label="응답자" value={`${fmtInt(o.n)}명`} sub={`${result.classNos.length}개 반`} />
        <KpiTile label="문항" value={`${result.mcCount}문항`} sub={result.crCount ? `+ 서답형 ${result.crCount}문항` : '선다형'} />
        <KpiTile label={`평균 (${exam.maxima.total}점 만점)`} value={fmt1(o.total.mean)} sub={`표준편차 ${fmt1(o.total.sd)} (${settings.sdMode === 'population' ? '모집단' : '표본'})`} />
        <KpiTile label="신뢰도 α (선다형)" value={fmt3(o.alphaMc)} sub={<BandBadge band={alphaBand(o.alphaMc)} />} />
        <KpiTile label="성취수준 A 비율" value={`${fmt1(o.levelPct.A)}%`} sub={`E ${fmt1(o.levelPct.E)}%`} />
      </div>

      <div className="grid grid-2">
        <section className="card">
          <SectionTitle title="성취수준 분포">분할점수 A {settings.cutoffs.AB} / B {settings.cutoffs.BC} / C {settings.cutoffs.CD} / D {settings.cutoffs.DE} 이상</SectionTitle>
          <LevelStackedBar groups={groups} height={Math.max(160, 60 + groups.length * 34)} />
          <LevelLegend />
        </section>
        <section className="card">
          <SectionTitle title="점수 분포">100점 환산, 5점 구간, 막대 색 = 성취수준</SectionTitle>
          <ScoreHistogram bins={result.histogram} cutoffs={settings.cutoffs} />
        </section>
      </div>

      <section className="card">
        <SectionTitle title="성취수준별 평균·표준편차">기존 KICE 프로그램 "성취도분석표"와 같은 구성</SectionTitle>
        <LevelStatsTable result={result} exam={exam} />
      </section>
    </div>
  )
}
