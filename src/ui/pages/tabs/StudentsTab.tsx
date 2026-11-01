import { useMemo, useState } from 'react'
import type { AnalysisResult, Exam, StudentResult } from '../../../model/types'
import { useAppStore } from '../../store/useAppStore'
import { fmt1, fmtPoints } from '../../../model/format'
import { LevelChip, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { Drawer } from '../../components/Drawer'
import { StudentReport } from '../StudentReport'
import { navigate } from '../../app/router'

export function StudentsTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const [q, setQ] = useState('')
  const selectedId = useAppStore((s) => s.ui.selectedStudentId)
  const setUi = useAppStore((s) => s.setUi)
  const settings = useAppStore((s) => s.settings)
  const hasCr = exam.maxima.cr > 0
  const rows = useMemo(() => {
    const t = q.trim()
    if (!t) return result.students
    return result.students.filter((s) => s.student.name.includes(t) || s.student.id.includes(t) || s.student.studentId.includes(t))
  }, [q, result.students])
  const cols: Column<StudentResult>[] = [
    { id: 'cls', header: '반', accessor: (r) => Number(r.student.classNo), cell: (r) => r.student.classNo, align: 'center', sortable: true, width: 44 },
    { id: 'seat', header: '번호', accessor: (r) => r.student.seatNo, align: 'center', sortable: true, width: 52 },
    { id: 'name', header: '이름', accessor: (r) => r.student.name, cell: (r) => <span className="nowrap">{r.student.name}</span>, sortable: true },
    { id: 'sid', header: '학번', accessor: (r) => r.student.studentId, cell: (r) => <span className="small muted">{r.student.studentId}</span> },
    { id: 'mc', header: `선다형 (${exam.maxima.mc})`, accessor: (r) => r.mcScore, cell: (r) => fmtPoints(r.mcScore), sortable: true },
    ...(hasCr ? ([{ id: 'cr', header: `서답형 (${exam.maxima.cr})`, accessor: (r) => r.crScore, cell: (r) => fmtPoints(r.crScore), sortable: true }] as Column<StudentResult>[]) : []),
    { id: 'total', header: `총점 (${exam.maxima.total})`, accessor: (r) => r.total, cell: (r) => <strong>{fmtPoints(r.total)}</strong>, sortable: true },
    { id: 'pct', header: '성취율(%)', accessor: (r) => r.pct, cell: (r) => fmt1(r.pct), sortable: true },
    { id: 'lv', header: '수준', accessor: (r) => r.level, cell: (r) => <LevelChip level={r.level} />, align: 'center', sortable: true },
    { id: 'wrong', header: '틀린 문항', accessor: (r) => r.wrongItems.length, cell: (r) => <span className="small">{r.wrongItems.length ? r.wrongItems.map((w) => w.no).join(', ') : '없음'}</span>, align: 'left', sortable: true },
  ]
  const selected = selectedId ? result.students.find((s) => s.student.id === selectedId) : undefined
  return (
    <div className="stack">
      <section className="card">
        <SectionTitle
          title="학생별 결과"
          right={
            <div className="row">
              <input type="search" placeholder="이름·번호·학번 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="학생 검색" style={{ padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 6 }} />
              {exam.classes.map((c) => (
                <button key={c.classNo} type="button" className="btn btn-sm" onClick={() => navigate(`/print/class/${c.classNo}`)}>
                  🖨 {c.classNo}반 리포트 인쇄
                </button>
              ))}
            </div>
          }
        >
          행을 누르면 개인별 리포트(틀린 문항·성취기준 도달)를 봅니다. {rows.length}명
        </SectionTitle>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.student.id} onRowClick={(r) => setUi({ selectedStudentId: r.student.id })} selectedKey={selectedId} initialSort={{ id: 'cls', dir: 'asc' }} compact />
      </section>
      <Drawer open={!!selected} onClose={() => setUi({ selectedStudentId: null })} title="학생 리포트" wide>
        {selected && (
          <div className="stack">
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/print/student/${encodeURIComponent(selected.student.id)}`)}>
                🖨 이 학생 인쇄
              </button>
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/print/class/${selected.student.classNo}`)}>
                🖨 {selected.student.classNo}반 전체 인쇄
              </button>
            </div>
            <StudentReport exam={exam} result={result} student={selected} settings={settings} />
          </div>
        )}
      </Drawer>
    </div>
  )
}
