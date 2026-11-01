import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useAppStore, type FileEntry } from '../store/useAppStore'
import { navigate } from '../app/router'
import { Callout, WarningList } from '../components/basic'
import { describeHeader } from '../../parsers/header'

function FileChip({ f, onRemove }: { f: FileEntry; onRemove: () => void }) {
  const icon = f.status === 'parsing' ? '⏳' : f.status === 'ok' ? '✅' : '⚠️'
  return (
    <li className={`file-chip${f.status === 'error' ? ' error' : ''}`}>
      <span aria-hidden="true">{icon}</span>
      <span className="name" title={f.name}>
        {f.name}
      </span>
      <span className="muted small">{f.status === 'parsing' ? '읽는 중…' : f.status === 'ok' ? f.label : f.error}</span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onRemove} aria-label={`${f.name} 제거`}>
        ✕
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
      const base = import.meta.env.BASE_URL
      const manifest = (await (await fetch(`${base}demo/manifest.json`)).json()) as { files: string[] }
      const files: File[] = []
      for (const name of manifest.files) {
        const buf = await (await fetch(`${base}demo/${encodeURIComponent(name)}`)).arrayBuffer()
        files.push(new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      }
      await addFiles(files)
    } catch (e) {
      setErr(`예시 데이터를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="btn" onClick={load} disabled={busy}>
        {busy ? '불러오는 중…' : '예시 데이터로 체험'}
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
  const [active, setActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setActive(false)
      const list = Array.from(e.dataTransfer.files)
      if (list.length) void addFiles(list)
    },
    [addFiles],
  )

  const parsing = files.some((f) => f.status === 'parsing')
  const ready = !!exam && buildErrors.length === 0 && !parsing
  const studentCount = exam?.classes.reduce((a, c) => a + c.students.length, 0) ?? 0

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="#/">
            성취평가 결과 분석
          </a>
          <span className="meta">NEIS 엑셀을 그대로 올리면 됩니다</span>
          <div className="actions">
            <a className="btn btn-sm" href="https://github.com/Raph-Alpaca/exam-analysis" target="_blank" rel="noreferrer">
              사용 안내
            </a>
          </div>
        </div>
      </header>
      <main className="container page stack">
        <section className="steps" aria-label="사용 순서">
          <div className="step">
            <span className="n">1</span>
            <strong>NEIS에서 내려받기</strong>
            <div className="muted small">교과목별 학생답 정오표(반별)와 문항정보표. 수정하지 않아도 됩니다.</div>
          </div>
          <div className="step">
            <span className="n">2</span>
            <strong>여기에 끌어다 놓기</strong>
            <div className="muted small">여러 반 파일을 한꺼번에. 파일 종류는 자동으로 알아봅니다.</div>
          </div>
          <div className="step">
            <span className="n">3</span>
            <strong>결과 보기</strong>
            <div className="muted small">성취도·문항·성취수준별·성취기준별 분석, 엑셀·인쇄 보고서.</div>
          </div>
        </section>

        <div
          className={`dropzone${active ? ' active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setActive(true)
          }}
          onDragLeave={() => setActive(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
          role="button"
          tabIndex={0}
          aria-label="엑셀 파일 선택 또는 끌어다 놓기"
        >
          <div className="big">엑셀 파일을 여기에 끌어다 놓거나 클릭해서 선택하세요</div>
          <div className="muted">학생답 정오표 (필수) · 문항정보표 · 정답/배점표 · 문항분석표 — .xlsx, .xls</div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="visually-hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? [])
              if (list.length) void addFiles(list)
              e.target.value = ''
            }}
          />
        </div>

        <Callout tone="good">
          <strong>개인정보 안내</strong> 파일은 이 브라우저 안에서만 읽고 계산합니다. 어떤 서버로도 전송하지 않으며, 새로고침하면 자료가 사라집니다.
        </Callout>

        {files.length > 0 && (
          <section className="card stack-sm" aria-label="올린 파일">
            <div className="card-title">
              <h2>올린 파일 ({files.length})</h2>
              <button type="button" className="btn btn-sm" onClick={clearAll}>
                모두 지우기
              </button>
            </div>
            <ul className="file-list">
              {files.map((f) => (
                <FileChip key={f.id} f={f} onRemove={() => removeFile(f.id)} />
              ))}
            </ul>
            <WarningList warnings={[...buildErrors, ...buildWarnings]} />
            {exam && (
              <Callout>
                <strong>{describeHeader(exam.header)}</strong> · {exam.classes.length}개 반 · 학생 {studentCount}명 · 선다형 {exam.items.filter((i) => i.kind === 'mc').length}문항
                {exam.items.some((i) => i.kind === 'cr') && ` · 서답형 ${exam.items.filter((i) => i.kind === 'cr').length}문항`}
                {exam.hasItemInfo ? ' · 성취기준·내용영역 분석 가능' : ' · 성취기준이 포함된 문항정보표가 없어 성취기준·내용영역 분석은 제외됩니다(그 외 분석은 모두 가능)'}
              </Callout>
            )}
          </section>
        )}

        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => navigate('/results/overview')}>
            분석 시작 →
          </button>
          <DemoButton />
        </div>

        <details className="help card">
          <summary>NEIS에서 파일 내려받는 방법</summary>
          <ol className="small">
            <li>
              <strong>학생답 정오표</strong>: 성적 › 지필평가조회 › <em>교과목별 학생답 정오표 조회</em> › 고사·학년·과목 선택 › 조회 › 저장(엑셀). 반마다 한 파일씩 받습니다. 여러 반이 한 파일에 있어도 됩니다.
            </li>
            <li>
              <strong>문항정보표</strong>(선택): 성적 › 지필평가 › 문항정보표 › 출력 › XLS data. 올리면 성취기준·내용영역·예상난이도 분석이 추가됩니다.
            </li>
            <li>
              <strong>정답/배점표</strong>(선택): 성적 › 지필평가조회 › 정답/배점. 정오표와 대조해 검증합니다.
            </li>
            <li>
              <strong>문항분석표</strong>(선택): 성적 › 지필평가조회 › 문항분석표. 학년 전체 수치와 비교할 때 씁니다. 모든 반의 정오표를 올리면 없어도 됩니다.
            </li>
            <li>
              <strong>서답형 문항별 분석</strong>을 원하면 정오표에서 마지막 선다형 문항과 "선택형점수" 사이에 <code>서답1, 서답2…</code> 열을 추가하고 배점 행과 학생별 점수를 채워 올리세요.
            </li>
          </ol>
        </details>
      </main>
    </>
  )
}
