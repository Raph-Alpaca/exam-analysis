import { useEffect } from 'react'
import { matchPath, useHashPath } from './router'
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
  let page: React.ReactNode
  let m: Record<string, string> | null
  if ((m = matchPath('/results/:tab', path))) page = <ResultsPage tab={m.tab as ResultTab} />
  else if (path === '/results') page = <ResultsPage tab="overview" />
  else if (path === '/print/report') page = <PrintReportPage />
  else if ((m = matchPath('/print/student/:id', path))) page = <PrintStudentsPage studentId={m.id!} />
  else if ((m = matchPath('/print/class/:classId', path))) page = <PrintStudentsPage classNo={m.classId!} />
  else page = <UploadPage />
  return <ErrorBoundary key={path}>{page}</ErrorBoundary>
}
