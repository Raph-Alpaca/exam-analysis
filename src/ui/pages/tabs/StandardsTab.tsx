import { useState } from 'react'
import { LEVELS, type AnalysisResult, type Exam, type StandardStats } from '../../../model/types'
import { fmt1, fmtInt, fmtPoints } from '../../../model/format'
import { heatStyle } from '../../theme/levels'
import { EmptyState, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { StandardAchievementBar } from '../../charts/charts'

export function standardColumns(result: AnalysisResult, opts: { kind: 'standard' | 'domain'; classes?: boolean; compact?: boolean }): Column<StandardStats>[] {
  const cols: Column<StandardStats>[] = []
  if (opts.kind === 'standard') {
    cols.push({ id: 'code', header: '성취기준', accessor: (r) => r.code, cell: (r) => <strong className="nowrap">{r.code}</strong>, sortable: true })
    cols.push({ id: 'text', header: '내용', accessor: (r) => r.text, cell: (r) => <span className="small">{r.text}</span> })
    if (!opts.compact) cols.push({ id: 'domain', header: '내용영역', accessor: (r) => r.domain ?? '', sortable: true })
  } else {
    cols.push({ id: 'code', header: '내용영역', accessor: (r) => r.code, cell: (r) => <strong>{r.code}</strong>, sortable: true })
  }
  cols.push(
    { id: 'items', header: '문항', cell: (r) => <span className="small nowrap">{r.itemNos.join(', ')}</span>, accessor: (r) => r.itemNos.length, sortable: true },
    { id: 'n', header: '문항 수', accessor: (r) => r.itemNos.length, cell: (r) => fmtInt(r.itemNos.length) },
    { id: 'max', header: '만점', accessor: (r) => r.maxPoints, cell: (r) => fmtPoints(r.maxPoints) },
    { id: 'rawm', header: '평균', group: '원점수', accessor: (r) => r.overall.raw.mean, cell: (r) => fmt1(r.overall.raw.mean) },
    { id: 'raws', header: '표준편차', group: '원점수', accessor: (r) => r.overall.raw.sd, cell: (r) => fmt1(r.overall.raw.sd) },
    { id: 'rate', header: '전체', group: '성취율(%)', accessor: (r) => r.overall.rate, cell: (r) => <strong>{fmt1(r.overall.rate)}</strong>, cellStyle: (r) => heatStyle(r.overall.rate), sortable: true },
    ...LEVELS.map(
      (l): Column<StandardStats> => ({
        id: `l${l}`,
        header: `${l} (${result.byLevel[l].n})`,
        group: '성취율(%)',
        accessor: (r) => r.byLevel[l].rate,
        cell: (r) => fmt1(r.byLevel[l].rate),
        cellStyle: (r) => heatStyle(r.byLevel[l].rate),
        sortable: true,
      }),
    ),
  )
  if (opts.classes && result.classNos.length > 1)
    cols.push(
      ...result.classNos.map(
        (c): Column<StandardStats> => ({ id: `c${c}`, header: `${c}반`, group: '학급별 성취율(%)', accessor: (r) => r.byClass[c]?.rate ?? null, cell: (r) => fmt1(r.byClass[c]?.rate), cellStyle: (r) => heatStyle(r.byClass[c]?.rate), sortable: true }),
      ),
    )
  return cols
}

export function StandardsTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const [byLevel, setByLevel] = useState(false)
  const [showClasses, setShowClasses] = useState(false)
  if (!exam.hasItemInfo || result.standards.length === 0) {
    return (
      <EmptyState>
        <p>성취기준·내용영역 분석에는 성취기준·난이도가 들어 있는 NEIS <strong>문항정보표</strong>가 필요합니다. 정답/배점만 있는 간략형 문항정보표로는 이 탭을 만들 수 없습니다.</p>
        <a className="btn" href="#/">
          문항정보표 추가하기
        </a>
      </EmptyState>
    )
  }
  const weakest = [...result.standards].sort((a, b) => (a.overall.rate ?? 101) - (b.overall.rate ?? 101)).slice(0, 3)
  return (
    <div className="stack">
      <div className="grid grid-2">
        <section className="card">
          <SectionTitle title="성취기준별 성취율" right={<label className="checkbox small"><input type="checkbox" checked={byLevel} onChange={(e) => setByLevel(e.target.checked)} /> 성취수준별로 보기</label>}>
            성취율 = 해당 성취기준 문항의 획득 점수 합 ÷ 배점 합 × 100
          </SectionTitle>
          <StandardAchievementBar stats={result.standards} byLevel={byLevel} />
        </section>
        <section className="card">
          <SectionTitle title="보완이 필요한 성취기준">전체 성취율이 가장 낮은 3개</SectionTitle>
          <ol style={{ paddingLeft: 20, margin: 0 }} className="stack-sm">
            {weakest.map((s) => (
              <li key={s.code}>
                <strong>{s.code}</strong> <span className="badge badge-warn">{fmt1(s.overall.rate)}%</span>
                <div className="small muted">{s.text}</div>
                <div className="small">
                  문항 {s.itemNos.join(', ')} · 수준별 {LEVELS.map((l) => `${l} ${fmt1(s.byLevel[l].rate)}`).join(' / ')}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="card">
        <SectionTitle title="내용영역별 분석">기존 KICE 프로그램 "평가영역별분석"과 같은 구성 (원점수·100점 환산·수준별)</SectionTitle>
        <DataTable columns={standardColumns(result, { kind: 'domain', classes: showClasses })} rows={result.domains} rowKey={(r) => r.code} compact />
      </section>
      <section className="card">
        <SectionTitle title="성취기준별 분석" right={result.classNos.length > 1 ? <label className="checkbox small"><input type="checkbox" checked={showClasses} onChange={(e) => setShowClasses(e.target.checked)} /> 학급별 열 보기</label> : undefined}>
          Shiny 웹앱의 "성취수준별 성취기준 성취율"과 같은 표. 진할수록 성취율이 높습니다.
        </SectionTitle>
        <DataTable columns={standardColumns(result, { kind: 'standard', classes: showClasses })} rows={result.standards} rowKey={(r) => r.code} compact />
      </section>
    </div>
  )
}
