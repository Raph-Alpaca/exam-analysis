import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useFullAnalysis } from '../store/useAnalysis'
import { describeHeader } from '../../parsers/header'
import { EmptyState } from '../components/basic'
import { StudentReport } from './StudentReport'
import { PrintHeader, PrintToolbar } from './PrintReportPage'

export function PrintStudentsPage({ studentId, classNo }: { studentId?: string; classNo?: string }) {
  const exam = useAppStore((s) => s.exam)
  const settings = useAppStore((s) => s.settings)
  const result = useFullAnalysis()
  useEffect(() => {
    document.title = classNo ? `${classNo}반 학생 리포트` : '학생 리포트'
  }, [classNo])
  if (!exam || !result) {
    return (
      <main className="container page">
        <EmptyState>
          분석할 자료가 없습니다. <a href="#/">파일 올리기</a>
        </EmptyState>
      </main>
    )
  }
  const students = studentId ? result.students.filter((s) => s.student.id === studentId) : result.students.filter((s) => s.student.classNo === classNo).sort((a, b) => a.student.seatNo - b.student.seatNo)
  const meta = describeHeader(exam.header)
  return (
    <div className="print-view">
      <PrintToolbar title={studentId ? '학생 리포트' : `${classNo}반 학생 리포트 (${students.length}명)`} />
      {students.length === 0 && <EmptyState>해당 학생이 없습니다.</EmptyState>}
      {students.map((s) => (
        <section className="print-page" key={s.student.id}>
          <PrintHeader title="학생 성취평가 결과" meta={meta} />
          <StudentReport exam={exam} result={result} student={s} settings={settings} compact />
        </section>
      ))}
    </div>
  )
}
