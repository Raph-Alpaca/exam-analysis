import { useEffect, useRef } from 'react'
import { matchPath, useHashPath } from './router'
import { useAppStore } from '../store/useAppStore'
import { loadDemoFiles } from '../store/demo'
import { ErrorBoundary } from './ErrorBoundary'
import { UploadPage } from '../pages/UploadPage'
import { ResultsPage, type ResultTab } from '../pages/ResultsPage'
import { PrintReportPage } from '../pages/PrintReportPage'
import { PrintStudentsPage } from '../pages/PrintStudentsPage'
import { GuidePage } from '../pages/GuidePage'

export function App() {
  const path = useHashPath()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [path])
  const hasExam = useAppStore((s) => s.exam != null)
  // "?demo=1" 링크의 예시는 그 주소로 들어왔을 때만 불러온다.
  // 같은 주소에 머문 채 자료를 지웠다고 다시 불러오면 "모두 지우기"가 되지 않는다.
  const demoCheckedPath = useRef<string | null>(null)
  useEffect(() => {
    if (demoCheckedPath.current === path) return
    demoCheckedPath.current = path
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
  else if (route === '/guide') page = <GuidePage />
  else page = <UploadPage />
  // 결과 탭끼리는 같은 화면이므로 key 를 바꾸지 않는다(탭마다 key 가 바뀌면 화면 전체를 새로 그려
  // 키보드 포커스와 엑셀 만드는 중 상태를 잃는다). 대신 주소가 바뀌면 오류 화면만 풀어 준다.
  return (
    <ErrorBoundary key={route.split('/')[1] ?? ''} resetKey={route}>
      {page}
    </ErrorBoundary>
  )
}
