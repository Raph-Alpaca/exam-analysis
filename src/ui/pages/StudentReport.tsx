import type { AnalysisResult, Exam, Response, StudentResult } from '../../model/types'
import type { Settings } from '../../model/settings'
import { fmt1, fmtPoints } from '../../model/format'
import { describeHeader } from '../../parsers/header'
import { cutoffFor } from '../../stats/levels'
import { Badge, LevelChip } from '../components/basic'
import { DataTable, type Column } from '../components/DataTable'

export function responseText(r: Response): string {
  switch (r.k) {
    case 'correct':
      return '정답'
    case 'wrong':
      return `${r.choice}번`
    case 'blank':
      return '무표기'
    case 'multi':
      return `복수(${r.choices.join(',')})`
    default:
      return r.raw
  }
}

export function StudentReport({ exam, result, student, settings, compact }: { exam: Exam; result: AnalysisResult; student: StudentResult; settings: Settings; compact?: boolean }) {
  const st = student.student
  const cls = result.byClass[st.classNo]
  const cut = cutoffFor(student.level, settings.cutoffs)
  const hasCr = exam.maxima.cr > 0
  const wrongCols: Column<(typeof student.wrongItems)[number]>[] = [
    { id: 'no', header: '문항', accessor: (r) => r.no, align: 'center', width: 48 },
    ...(exam.items.some((i) => i.domain) ? ([{ id: 'domain', header: '내용영역', accessor: (r) => r.domain ?? '' }] as Column<(typeof student.wrongItems)[number]>[]) : []),
    ...(exam.hasItemInfo ? ([{ id: 'std', header: '성취기준', cell: (r) => <span className="small nowrap">{r.standards.join(' ')}</span> }] as Column<(typeof student.wrongItems)[number]>[]) : []),
    { id: 'my', header: '내 답', cell: (r) => responseText(r.response), align: 'center' },
    { id: 'key', header: '정답', cell: (r) => r.key.join(',') || '-', align: 'center' },
    { id: 'pts', header: '배점', accessor: (r) => r.points, cell: (r) => fmtPoints(r.points) },
    { id: 'p', header: '전체 정답률', accessor: (r) => r.overallP, cell: (r) => `${fmt1(r.overallP)}%`, headerTitle: '낮을수록 모두가 어려워한 문항' },
  ]
  const stdCols: Column<(typeof student.standards)[number]>[] = [
    { id: 'code', header: '성취기준', cell: (r) => <strong className="nowrap">{r.code}</strong> },
    { id: 'text', header: '내용', cell: (r) => <span className="small">{r.text}</span> },
    { id: 'score', header: '획득/배점', cell: (r) => `${fmtPoints(r.earned)} / ${fmtPoints(r.max)}`, align: 'center' },
    { id: 'rate', header: '성취율', accessor: (r) => r.rate, cell: (r) => `${fmt1(r.rate)}%` },
    { id: 'status', header: '도달', cell: (r) => <Badge tone={r.status === '도달' ? 'good' : r.status === '부분' ? 'warn' : 'danger'}>{r.status}</Badge>, align: 'center' },
  ]
  return (
    <article className={`stack${compact ? ' student-compact' : ''}`} aria-label={`${st.classNo}반 ${st.seatNo}번 ${st.name} 리포트`}>
      <div className="report-head">
        <div>
          {!compact && <div className="muted small">{describeHeader(exam.header)}</div>}
          <h2 style={{ margin: 0 }}>
            {st.classNo}반 {st.seatNo}번 {st.name}
          </h2>
          {st.studentId && <div className="muted small">학번 {st.studentId}</div>}
        </div>
      </div>
      <div className="score-card">
        <LevelChip level={student.level} large />
        <div>
          <div className="big-num">
            {fmtPoints(student.total)} <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>/ {exam.maxima.total}점</span>
          </div>
          <div className="small muted">
            성취율 {fmt1(student.pct)}%, 성취수준 {student.level}
            {cut != null ? ` (${cut}% 이상)` : ''}, 선다형 {fmtPoints(student.mcScore)}/{exam.maxima.mc}
            {hasCr && `, 서답형 ${fmtPoints(student.crScore)}/${exam.maxima.cr}`}
          </div>
        </div>
        <div className="small muted" style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div>
            {st.classNo}반 평균 {fmt1(cls?.total.mean)}, 전체 평균 {fmt1(result.overview.total.mean)}
          </div>
          <div>틀린 문항 {student.wrongItems.length}개 / {result.mcCount}문항</div>
        </div>
      </div>
      <section>
        <h3>틀린 문항 ({student.wrongItems.length})</h3>
        {student.wrongItems.length === 0 ? <p className="muted">선다형 문항을 모두 맞혔습니다.</p> : <DataTable columns={wrongCols} rows={student.wrongItems} rowKey={(r) => String(r.no)} compact maxHeight={compact ? undefined : 360} />}
      </section>
      {student.standards.length > 0 && (
        <section>
          <h3>성취기준별 도달 현황</h3>
          <DataTable columns={stdCols} rows={student.standards} rowKey={(r) => r.code} compact />
          <p className="small muted" style={{ marginTop: 4, marginBottom: 0 }}>
            도달은 성취율 {settings.standardPassPct}% 이상, 부분은 50% 이상, 미도달은 50% 미만입니다.
          </p>
        </section>
      )}
    </article>
  )
}
