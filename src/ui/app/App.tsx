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
  let onUploadPage = false
  let m: Record<string, string> | null
  if ((m = matchPath('/results/:tab', route))) page = <ResultsPage tab={m.tab as ResultTab} />
  else if (route === '/results') page = <ResultsPage tab="overview" />
  else if (route === '/print/report') page = <PrintReportPage />
  else if ((m = matchPath('/print/student/:id', path))) page = <PrintStudentsPage studentId={m.id!} />
  else if ((m = matchPath('/print/class/:classId', path))) page = <PrintStudentsPage classNo={m.classId!} />
  else if (route === '/guide') page = <GuidePage />
  else {
    page = <UploadPage />
    onUploadPage = true
  }

  // 파일 올리기 화면이 아닌 곳에 파일을 떨어뜨리면 브라우저가 그 파일을 열어 버려 올린 자료가 사라진다. 그것을 막는다.
  // 파일 올리기 화면은 스스로 받으므로(UploadPage) 여기서는 손대지 않는다 — 그쪽이 defaultPrevented 를
  // "이미 받았음" 표시로 쓰기 때문에, 여기서 먼저 막으면 카드 밖에 놓은 파일을 받지 못한다.
  useEffect(() => {
    if (onUploadPage) return
    const block = (e: DragEvent) => {
      // 파일을 끄는 경우만 막는다. 글자를 입력 칸에 끌어다 놓는 것은 그대로 둔다.
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types ?? []).includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [onUploadPage])
  // 결과 탭끼리는 같은 화면이므로 key 를 바꾸지 않는다(탭마다 key 가 바뀌면 화면 전체를 새로 그려
  // 키보드 포커스와 엑셀 만드는 중 상태를 잃는다). 대신 주소가 바뀌면 오류 화면만 풀어 준다.
  return (
    <ErrorBoundary key={route.split('/')[1] ?? ''} resetKey={route}>
      {page}
    </ErrorBoundary>
  )
}
