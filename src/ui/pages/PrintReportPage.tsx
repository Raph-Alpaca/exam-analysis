import { useEffect } from 'react'
import { LEVELS } from '../../model/types'
import { useAppStore } from '../store/useAppStore'
import { useAnalysis } from '../store/useAnalysis'
import { alphaBand } from '../../model/thresholds'
import { fmt1, fmt3, fmtInt } from '../../model/format'
import { describeHeader } from '../../parsers/header'
import { BandBadge, EmptyState, KpiTile, LevelChip, LevelLegend } from '../components/basic'
import { DataTable } from '../components/DataTable'
import { LevelStackedBar, ScoreHistogram, StandardAchievementBar } from '../charts/charts'
import { LevelStatsTable } from './tabs/OverviewTab'
import { ClassStatsTable, ItemByClassTable } from './tabs/ClassCompareTab'
import { itemColumns } from './tabs/ItemAnalysisTab'
import { levelMatrixColumns, levelMatrixRows } from './tabs/LevelAnalysisTab'
import { standardColumns } from './tabs/StandardsTab'
import { CrItemCard } from './tabs/ConstructedTab'

const SECTIONS = [
  { id: 'summary', label: '요약' },
  { id: 'classes', label: '학급별' },
  { id: 'items', label: '문항 분석' },
  { id: 'levels', label: '성취수준별' },
  { id: 'standards', label: '성취기준·영역' },
  { id: 'constructed', label: '서답형' },
  { id: 'appendix', label: '부록(설정·기준)' },
] as const

export function PrintToolbar({ title, children }: { title: string; children?: React.ReactNode }) {
  const print = async () => {
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
    window.print()
  }
  return (
    <div className="print-toolbar screen-only">
      <div className="container row row-between">
        <div className="row">
          <strong>{title}</strong>
          {children}
        </div>
        <div className="row">
          <span className="small muted">인쇄 대화상자에서 "배경 그래픽"을 켜면 색이 유지됩니다</span>
          <button type="button" className="btn" onClick={() => window.history.back()}>
            ← 돌아가기
          </button>
          <button type="button" className="btn btn-primary" onClick={print}>
            🖨 인쇄 / PDF 저장
          </button>
        </div>
      </div>
    </div>
  )
}

export function PrintHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="print-header">
      <span>{meta}</span>
      <span>{title}</span>
    </div>
  )
}

export function PrintReportPage() {
  const exam = useAppStore((s) => s.exam)
  const settings = useAppStore((s) => s.settings)
  const sections = useAppStore((s) => s.ui.printSections)
  const setUi = useAppStore((s) => s.setUi)
  const result = useAnalysis()
  useEffect(() => {
    document.title = exam ? `${describeHeader(exam.header)} 성취평가 분석 보고서` : '보고서'
  }, [exam])
  if (!exam || !result) {
    return (
      <main className="container page">
        <EmptyState>
          분석할 자료가 없습니다. <a href="#/">파일 올리기</a>
        </EmptyState>
      </main>
    )
  }
  const on = (id: string) => sections[id] !== false
  const meta = `${describeHeader(exam.header)} · ${result.classNos.length}개 반 ${fmtInt(result.overview.n)}명${result.classNos.length < exam.classes.length ? ` (${result.classNos.map((c) => `${c}반`).join(', ')})` : ''}`
  const o = result.overview
  const groups = [{ name: '전체', stats: o }, ...result.classNos.map((c) => ({ name: `${c}반`, stats: result.byClass[c]! }))]
  const W = 680
  return (
    <div className="print-view">
      <PrintToolbar title="분석 보고서">
        <span className="row small">
          {SECTIONS.map((s) => (
            <label key={s.id} className="checkbox">
              <input type="checkbox" checked={on(s.id)} onChange={(e) => setUi({ printSections: { ...sections, [s.id]: e.target.checked } })} /> {s.label}
            </label>
          ))}
        </span>
      </PrintToolbar>

      {on('summary') && (
        <section className="print-page">
          <PrintHeader title="1. 요약" meta={meta} />
          <h1>성취평가 결과 분석 보고서</h1>
          <p className="muted">{meta} · 작성 {new Date().toLocaleDateString('ko-KR')}</p>
          <div className="grid grid-kpi">
            <KpiTile label="응답자" value={`${fmtInt(o.n)}명`} />
            <KpiTile label="문항" value={`${result.mcCount}${result.crCount ? ` + 서답형 ${result.crCount}` : ''}`} />
            <KpiTile label={`평균 (${exam.maxima.total}점)`} value={fmt1(o.total.mean)} sub={`SD ${fmt1(o.total.sd)}`} />
            <KpiTile label="신뢰도 α" value={fmt3(o.alphaMc)} sub={<BandBadge band={alphaBand(o.alphaMc)} />} />
          </div>
          <h3 style={{ marginTop: 14 }}>성취수준 분포</h3>
          <LevelStackedBar groups={groups} height={Math.max(140, 50 + groups.length * 30)} width={W} />
          <LevelLegend />
          <h3 style={{ marginTop: 14 }}>점수 분포 (100점 환산)</h3>
          <ScoreHistogram bins={result.histogram} cutoffs={settings.cutoffs} height={220} width={W} />
          <h3 style={{ marginTop: 14 }}>성취수준별 평균·표준편차</h3>
          <LevelStatsTable result={result} exam={exam} />
        </section>
      )}

      {on('classes') && result.classNos.length > 1 && (
        <section className="print-page">
          <PrintHeader title="2. 학급별" meta={meta} />
          <h2>학급별 성취도</h2>
          <ClassStatsTable result={result} />
          <h3 style={{ marginTop: 14 }}>문항 × 학급 정답률(%)</h3>
          <ItemByClassTable exam={exam} result={result} caption="" />
        </section>
      )}

      {on('items') && (
        <section className="print-page">
          <PrintHeader title="3. 문항 분석" meta={meta} />
          <h2>선다형 문항 분석</h2>
          <p className="small muted">정답률 50% 미만 노랑, 25% 미만 빨강. 변별도 = 문항 점수와 (총점−문항 점수)의 상관. 진한 칸이 정답 답지.</p>
          <DataTable columns={itemColumns(exam, { compact: true })} rows={result.items} rowKey={(r) => String(r.no)} compact />
        </section>
      )}

      {on('levels') && (
        <section className="print-page">
          <PrintHeader title="4. 성취수준별" meta={meta} />
          <h2>정답률이 높은·낮은 3문항</h2>
          <table className="data compact">
            <thead>
              <tr>
                <th>집단</th>
                <th>학생 수</th>
                <th>높은 3문항 (정답률)</th>
                <th>낮은 3문항 (정답률)</th>
              </tr>
            </thead>
            <tbody>
              {(['all', ...LEVELS] as const).map((l) => {
                const stats = l === 'all' ? result.items : result.itemsByLevel[l]
                const n = l === 'all' ? o.n : result.byLevel[l].n
                const f = (nos: number[]) => nos.map((no) => `${no}번 (${fmt1(stats.find((s) => s.no === no)?.p)}%)`).join(', ') || '-'
                return (
                  <tr key={l}>
                    <td className="center">{l === 'all' ? '전체' : <LevelChip level={l} />}</td>
                    <td className="num">{n}</td>
                    <td>{n ? f(result.topBottom[l].top) : '-'}</td>
                    <td>{n ? f(result.topBottom[l].bottom) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <h3 style={{ marginTop: 14 }}>성취수준별 문항 정답률</h3>
          <DataTable columns={levelMatrixColumns(result)} rows={levelMatrixRows(result)} rowKey={(r) => String(r.no)} compact />
        </section>
      )}

      {on('standards') && exam.hasItemInfo && result.standards.length > 0 && (
        <section className="print-page">
          <PrintHeader title="5. 성취기준·내용영역" meta={meta} />
          <h2>내용영역별 분석</h2>
          <DataTable columns={standardColumns(result, { kind: 'domain' })} rows={result.domains} rowKey={(r) => r.code} compact />
          <h2 style={{ marginTop: 14 }}>성취기준별 성취율</h2>
          <StandardAchievementBar stats={result.standards} width={W} />
          <DataTable columns={standardColumns(result, { kind: 'standard', compact: true })} rows={result.standards} rowKey={(r) => r.code} compact />
        </section>
      )}

      {on('constructed') && result.constructed.length > 0 && (
        <section className="print-page">
          <PrintHeader title="6. 서답형" meta={meta} />
          <h2>서답형 문항 분석</h2>
          <div className="stack">
            {result.constructed.map((c) => (
              <CrItemCard key={c.label} item={c} />
            ))}
          </div>
        </section>
      )}

      {on('appendix') && (
        <section className="print-page">
          <PrintHeader title="부록" meta={meta} />
          <h2>분석 설정</h2>
          <ul className="small">
            <li>
              분할점수: A {settings.cutoffs.AB} / B {settings.cutoffs.BC} / C {settings.cutoffs.CD} / D {settings.cutoffs.DE} (% 이상)
            </li>
            <li>성취수준 산출 기준: {settings.levelBasis === 'subjectMax' ? `과목 만점(${exam.maxima.total})` : `선다형 만점(${exam.maxima.mc})`}</li>
            <li>표준편차: {settings.sdMode === 'population' ? '모집단(÷N)' : '표본(÷(N−1))'} · 총점 출처: {settings.scoreSource === 'neis' ? 'NEIS 영역총점' : '응답 재계산'}</li>
            <li>입력 파일: {exam.sources.join(', ')}</li>
          </ul>
          <h2>지표 해석 기준 (교육부·KICE)</h2>
          <ul className="small">
            <li>정답률(난이도): 75% 이상 쉬움 · 25~75% 보통 · 25% 미만 어려움</li>
            <li>변별도(문항-총점 상관): .10 미만 없음 · .10~.20 매우 낮음 · .20~.30 낮음 · .30~.40 있음 · .40 이상 높음</li>
            <li>신뢰도 α: .50 미만 수용 불가 · .50~.60 낮음 · .60~.70 의심 · .70~.80 수용 가능 · .80~.90 높음 · .90 이상 매우 높음</li>
            <li>답지반응률: 무표기·복수표기·무효 답은 "무응답·중복"으로 합산 (KICE 프로그램과 동일)</li>
          </ul>
          {result.warnings.length > 0 && (
            <>
              <h2>확인 사항</h2>
              <ul className="small">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
