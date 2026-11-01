import { useEffect } from 'react'
import { matchPath, useHashPath } from './router'
import { useAppStore } from '../store/useAppStore'
import { loadDemoFiles } from '../store/demo'
import { ErrorBoundary } from './ErrorBoundary'
import { UploadPage } from '../pages/UploadPage'
import { ResultsPage, type ResultTab } from '../pages/ResultsPage'
import { PrintReportPage } from '../pages/PrintReportPage'
import { PrintStudentsPage } from '../pages/PrintStudentsPage'

export function App() {
  const path = useHashPath()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])
  const hasExam = useAppStore((s) => s.exam != null)
  useEffect(() => {
    if (hasExam) return
    const q = path.split('?')[1] ?? ''
    if (new URLSearchParams(q).get('demo') === '1') void loadDemoFiles().then((files) => useAppStore.getState().addFiles(files))
  }, [path, hasExam])
  const route = path.split('?')[0]!
  let page: React.ReactNode
  let m: Record<string, string> | null
  if ((m = matchPath('/results/:tab', route))) page = <ResultsPage tab={m.tab as ResultTab} />
  else if (route === '/results') page = <ResultsPage tab="overview" />
  else if (route === '/print/report') page = <PrintReportPage />
  else if ((m = matchPath('/print/student/:id', path))) page = <PrintStudentsPage studentId={m.id!} />
  else if ((m = matchPath('/print/class/:classId', path))) page = <PrintStudentsPage classNo={m.classId!} />
  else page = <UploadPage />
  return <ErrorBoundary key={route}>{page}</ErrorBoundary>
}
