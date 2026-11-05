import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useAppStore, type FileEntry } from '../store/useAppStore'
import { navigate } from '../app/router'
import { Callout, WarningList } from '../components/basic'
import { Icon, OmrMark } from '../components/Icon'
import { describeHeader } from '../../parsers/header'
import { loadDemoFiles } from '../store/demo'
import type { FileKind } from '../../parsers/detect'

/** 필요한 파일은 세 가지. 정답·배점만 있는 문항정보표 양식(answerKey)도 문항정보표로 본다. */
const SLOTS: { id: 'answers' | 'info' | 'analysis'; name: string; note: string; kinds: FileKind[] }[] = [
  { id: 'answers', name: '교과목별 학생답 정오표', note: '필수, 반마다 한 파일', kinds: ['answers'] },
  { id: 'info', name: '문항정보표', note: '성취기준·난이도 분석에 씁니다', kinds: ['itemInfo', 'answerKey'] },
  { id: 'analysis', name: '문항분석표', note: '학년 전체와 비교할 때 씁니다', kinds: ['itemAnalysis'] },
]

function FileRow({ f, onRemove }: { f: FileEntry; onRemove: () => void }) {
  const kindLabel = f.status === 'parsing' ? '확인 중' : f.status === 'error' ? '읽지 못함' : (f.label?.split(' · ')[0] ?? '')
  const desc = f.status === 'parsing' ? '파일을 읽는 중입니다' : f.status === 'ok' ? f.label?.split(' · ').slice(1).join(', ') : f.error
  return (
    <li className={`file-row${f.status === 'error' ? ' is-error' : f.status === 'parsing' ? ' is-parsing' : ''}`}>
      <span className="status">
        <Icon name={f.status === 'ok' ? 'check' : f.status === 'parsing' ? 'spinner' : 'alert'} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="name" title={f.name}>
          {f.name}
        </div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      {kindLabel && <span className="file-kind">{kindLabel}</span>}
      <button type="button" className="btn btn-sm btn-ghost remove" onClick={onRemove} aria-label={`${f.name} 빼기`}>
        <Icon name="x" />
      </button>
    </li>
  )
}

function DemoButton() {
  const addFiles = useAppStore((s) => s.addFiles)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      await addFiles(await loadDemoFiles())
    } catch (e) {
      setErr(`예시 데이터를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="btn btn-lg" onClick={load} disabled={busy}>
        {busy ? '불러오는 중' : '예시 데이터로 둘러보기'}
      </button>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </>
  )
}

export function UploadPage() {
  const files = useAppStore((s) => s.files)
  const exam = useAppStore((s) => s.exam)
  const buildErrors = useAppStore((s) => s.buildErrors)
  const buildWarnings = useAppStore((s) => s.buildWarnings)
  const addFiles = useAppStore((s) => s.addFiles)
  const removeFile = useAppStore((s) => s.removeFile)
  const clearAll = useAppStore((s) => s.clearAll)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setOver(false)
      const list = Array.from(e.dataTransfer.files)
      if (list.length) void addFiles(list)
    },
    [addFiles],
  )

  // 카드 밖에 떨어뜨려도 브라우저가 파일을 열어 버리지 않게 하고, 그대로 받는다
  useEffect(() => {
    const onWinOver = (e: globalThis.DragEvent) => e.preventDefault()
    const onWinDrop = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      const list = Array.from(e.dataTransfer?.files ?? [])
      if (list.length) void addFiles(list)
    }
    window.addEventListener('dragover', onWinOver)
    window.addEventListener('drop', onWinDrop)
    return () => {
      window.removeEventListener('dragover', onWinOver)
      window.removeEventListener('drop', onWinDrop)
    }
  }, [addFiles])

  const parsing = files.some((f) => f.status === 'parsing')
  const ready = !!exam && buildErrors.length === 0 && !parsing
  const studentCount = exam?.classes.reduce((a, c) => a + c.students.length, 0) ?? 0
  const okFiles = files.filter((f) => f.status === 'ok')

  const slotState = SLOTS.map((slot) => {
    const mine = okFiles.filter((f) => f.kind && slot.kinds.includes(f.kind))
    let note = slot.note
    if (mine.length && slot.id === 'answers' && exam) note = `${exam.classes.length}개 반, 학생 ${studentCount}명`
    if (mine.length && slot.id === 'info') note = mine.some((f) => f.kind === 'itemInfo') ? '성취기준 포함' : '정답·배점만 있는 양식 (성취기준 분석은 빠짐)'
    if (mine.length && slot.id === 'analysis') {
      const ref = exam?.gradeReference
      note = ref?.verified ? `${ref.classNo}반 정오표와 대조 완료` : ref ? '학년 전체 비교에 사용' : '이 시험과 맞지 않아 쓰지 않음'
    }
    return { ...slot, count: mine.length, note }
  })
  const liveText = slotState.map((s) => `${s.name} ${s.count ? `${s.count}개 올림` : '없음'}`).join(', ')

  return (
    <>
      <header className="topbar">
        <div className="container container-upload topbar-inner">
          <a className="brand" href="#/">
            <OmrMark />
            성취평가 결과 분석
          </a>
          <div className="actions">
            <a className="btn btn-sm btn-ghost" href="https://github.com/Raph-Alpaca/exam-analysis#readme" target="_blank" rel="noreferrer">
              <Icon name="info" />
              <span className="label">사용 안내</span>
            </a>
          </div>
        </div>
      </header>

      <main className="upload">
        <div className="upload-head">
          <h1>NEIS에서 받은 엑셀을 그대로 올리세요</h1>
          <p>교과목별 학생답 정오표만 있으면 분석할 수 있습니다. 문항정보표와 문항분석표를 함께 올리면 성취기준별 분석과 학년 전체 비교가 더해집니다.</p>
        </div>

        <div
          className={`omr${over ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
          }}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="omr-prompt">
            <Icon name="upload" className="omr-drop-icon" />
            <div>
              <strong>여기에 파일을 끌어다 놓으세요</strong>
              <span className="muted">여러 반 파일을 한꺼번에 놓아도 됩니다. 파일 종류는 알아서 구분합니다.</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
            >
              파일 고르기
            </button>
          </div>
          <ul className="omr-sheet" aria-label="필요한 파일">
            {slotState.map((s) => (
              <li key={s.id} className="omr-item">
                <span className={`bubble${s.count ? ' is-filled' : ''}`} aria-hidden="true">
                  {s.count ? s.count : ''}
                </span>
                <div>
                  <div className="omr-item-name">{s.name}</div>
                  <div className="omr-item-note">{s.note}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="omr-foot">
            <Icon name="alert" />
            <span>
              NEIS에서 엑셀로 저장할 때는 꼭 <b>XLS data</b>를 고르세요.
            </span>
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? [])
              if (list.length) void addFiles(list)
              e.target.value = ''
            }}
          />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {liveText}
        </p>

        <p className="privacy">
          <Icon name="lock" />
          <span>파일은 이 컴퓨터의 브라우저 안에서만 읽고 계산합니다. 서버로 보내지 않으며, 창을 닫거나 새로고침하면 지워집니다.</span>
        </p>

        {files.length > 0 && (
          <section className="file-panel" aria-label="올린 파일">
            <div className="file-panel-head">
              <h2>올린 파일 {files.length}개</h2>
              <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll}>
                모두 지우기
              </button>
            </div>
            <ul className="file-list">
              {files.map((f) => (
                <FileRow key={f.id} f={f} onRemove={() => removeFile(f.id)} />
              ))}
            </ul>
            <div className="stack-sm upload-summary">
              <WarningList warnings={[...buildErrors, ...buildWarnings]} />
              {exam && buildErrors.length === 0 && (
                <Callout tone="good">
                  <strong>{describeHeader(exam.header)}</strong>
                  <div>
                    {exam.classes.length}개 반, 학생 {studentCount}명, 선다형 {exam.items.filter((i) => i.kind === 'mc').length}문항
                    {exam.items.some((i) => i.kind === 'cr') && `, 서답형 ${exam.items.filter((i) => i.kind === 'cr').length}문항`}을 분석할 수 있습니다.
                    {!exam.hasItemInfo && ' 성취기준이 들어 있는 문항정보표가 없어 성취기준·내용영역 분석은 빠집니다.'}
                  </div>
                </Callout>
              )}
            </div>
          </section>
        )}

        <div className="upload-actions">
          <button type="button" className="btn btn-primary btn-lg" disabled={!ready} onClick={() => navigate('/results/overview')}>
            분석 시작
          </button>
          <DemoButton />
          {!ready && files.length === 0 && <span className="note">학생답 정오표를 올리면 시작할 수 있습니다.</span>}
        </div>

        <details className="guide">
          <summary>NEIS에서 파일 내려받는 방법</summary>
          <div className="guide-body">
            <p className="xls-rule">
              <Icon name="alert" />
              <span>
                출력 화면의 저장 버튼을 누르면 PDF, XLS, XLS data 같은 형식을 고르게 됩니다. 엑셀로 받을 때는 반드시 <kbd>XLS data</kbd>를 고르세요.
              </span>
            </p>
            <ol className="guide-files">
              <li>
                <strong>교과목별 학생답 정오표</strong> <span className="badge badge-accent">필수</span>
                <div className="path">
                  <b>교과담임</b> › <b>정기시험조회/통계</b> › <b>정기시험조회</b>에서 조회한 뒤 XLS data로 저장합니다.
                </div>
                <div className="why">반마다 한 파일씩 받습니다. 여러 반이 한 파일에 들어 있어도 됩니다.</div>
              </li>
              <li>
                <strong>문항정보표</strong>
                <div className="path">
                  <b>교과담임</b> › <b>정기시험</b> › <b>문항정보표관리</b>에서 출력한 뒤 XLS data로 저장합니다.
                </div>
                <div className="why">성취기준·내용영역·예상 난이도 분석에 씁니다. 정답과 배점만 있는 양식이어도 올릴 수 있습니다.</div>
              </li>
              <li>
                <strong>문항분석표</strong>
                <div className="path">
                  <b>교과담임</b> › <b>정기시험조회/통계</b> › <b>정기시험통계</b>에서 조회한 뒤 XLS data로 저장합니다.
                </div>
                <div className="why">학년 전체 수치와 비교할 때 씁니다. 담당 반 것 하나면 되고, 학년 모든 반의 정오표를 올렸다면 없어도 됩니다.</div>
              </li>
            </ol>
          </div>
        </details>
      </main>

      <footer className="site-foot">
        <div className="container container-upload">
          <span>올린 파일은 이 브라우저 밖으로 나가지 않습니다.</span>
          <a href="https://github.com/Raph-Alpaca/exam-analysis" target="_blank" rel="noreferrer">
            소스 코드
          </a>
        </div>
      </footer>
    </>
  )
}
