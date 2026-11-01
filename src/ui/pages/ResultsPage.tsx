import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAnalysis } from '../store/useAnalysis'
import { navigate } from '../app/router'
import { Tabs } from '../components/Tabs'
import { Drawer } from '../components/Drawer'
import { EmptyState, WarningList } from '../components/basic'
import { SettingsPanel } from './SettingsPanel'
import { describeHeader } from '../../parsers/header'
import { exportExcel } from '../../export/excel'
import { OverviewTab } from './tabs/OverviewTab'
import { ClassCompareTab } from './tabs/ClassCompareTab'
import { ItemAnalysisTab } from './tabs/ItemAnalysisTab'
import { LevelAnalysisTab } from './tabs/LevelAnalysisTab'
import { StandardsTab } from './tabs/StandardsTab'
import { ConstructedTab } from './tabs/ConstructedTab'
import { StudentsTab } from './tabs/StudentsTab'

export type ResultTab = 'overview' | 'classes' | 'items' | 'levels' | 'standards' | 'constructed' | 'students'

const TAB_IDS: ResultTab[] = ['overview', 'classes', 'items', 'levels', 'standards', 'constructed', 'students']

export function ClassFilterBar() {
  const exam = useAppStore((s) => s.exam)
  const classFilter = useAppStore((s) => s.ui.classFilter)
  const setUi = useAppStore((s) => s.setUi)
  if (!exam || exam.classes.length < 2) return null
  const all = classFilter.length === 0
  const toggle = (c: string) => {
    const next = classFilter.includes(c) ? classFilter.filter((x) => x !== c) : [...classFilter, c]
    setUi({ classFilter: next.length === exam.classes.length ? [] : next })
  }
  return (
    <div className="row class-filter" role="group" aria-label="학급 필터">
      <span className="small muted">학급:</span>
      <button type="button" className={`btn btn-sm${all ? ' btn-primary' : ''}`} onClick={() => setUi({ classFilter: [] })} aria-pressed={all}>
        전체
      </button>
      {exam.classes.map((c) => {
        const on = !all && classFilter.includes(c.classNo)
        return (
          <button key={c.classNo} type="button" className={`btn btn-sm${on ? ' btn-primary' : ''}`} onClick={() => toggle(c.classNo)} aria-pressed={on}>
            {c.classNo}반
          </button>
        )
      })}
      {!all && <span className="small muted">선택한 반만 집계합니다</span>}
    </div>
  )
}

export function ResultsPage({ tab }: { tab: ResultTab }) {
  const exam = useAppStore((s) => s.exam)
  const buildWarnings = useAppStore((s) => s.buildWarnings)
  const settingsOpen = useAppStore((s) => s.ui.settingsOpen)
  const setUi = useAppStore((s) => s.setUi)
  const result = useAnalysis()
  const [exporting, setExporting] = useState(false)
  const activeTab: ResultTab = TAB_IDS.includes(tab) ? tab : 'overview'

  useEffect(() => {
    document.title = exam ? `${describeHeader(exam.header)} — 성취평가 결과 분석` : '성취평가 결과 분석'
  }, [exam])

  if (!exam || !result) {
    return (
      <main className="container page">
        <EmptyState>
          <p>분석할 자료가 없습니다. 새로고침하면 자료가 지워집니다(개인정보 보호를 위해 저장하지 않습니다).</p>
          <a className="btn btn-primary" href="#/">
            파일 올리기
          </a>
        </EmptyState>
      </main>
    )
  }

  const studentCount = exam.classes.reduce((a, c) => a + c.students.length, 0)
  const tabs = [
    { id: 'overview', label: '개요' },
    { id: 'classes', label: '학급별' },
    { id: 'items', label: '문항 분석' },
    { id: 'levels', label: '성취수준별' },
    { id: 'standards', label: '성취기준·영역', disabled: !exam.hasItemInfo, title: exam.hasItemInfo ? undefined : '문항정보표를 올리면 활성화됩니다' },
    { id: 'constructed', label: '서답형' },
    { id: 'students', label: '학생별' },
  ]

  const doExport = async () => {
    setExporting(true)
    try {
      await exportExcel(exam, result, useAppStore.getState().settings)
    } catch (e) {
      alert(`엑셀 내보내기에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="#/">
            성취평가 결과 분석
          </a>
          <span className="meta">
            {describeHeader(exam.header)} · {exam.classes.length}개 반 · {studentCount}명 · {result.mcCount}문항{result.crCount ? ` + 서답형 ${result.crCount}` : ''}
          </span>
          <div className="actions">
            <a className="btn btn-sm" href="#/">
              파일 추가·변경
            </a>
            <button type="button" className="btn btn-sm" onClick={() => setUi({ settingsOpen: true })}>
              ⚙ 설정
            </button>
            <button type="button" className="btn btn-sm" onClick={doExport} disabled={exporting}>
              {exporting ? '만드는 중…' : '⬇ 엑셀 내보내기'}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => navigate('/print/report')}>
              🖨 보고서 인쇄
            </button>
          </div>
        </div>
      </header>
      <main className="container page">
        <Tabs tabs={tabs} active={activeTab} onChange={(id) => navigate(`/results/${id}`)} ariaLabel="분석 탭" />
        <div className="stack">
          <ClassFilterBar />
          {activeTab === 'overview' && <WarningList warnings={[...buildWarnings, ...result.warnings]} />}
          <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
            {activeTab === 'overview' && <OverviewTab exam={exam} result={result} />}
            {activeTab === 'classes' && <ClassCompareTab exam={exam} result={result} />}
            {activeTab === 'items' && <ItemAnalysisTab exam={exam} result={result} />}
            {activeTab === 'levels' && <LevelAnalysisTab exam={exam} result={result} />}
            {activeTab === 'standards' && <StandardsTab exam={exam} result={result} />}
            {activeTab === 'constructed' && <ConstructedTab exam={exam} result={result} />}
            {activeTab === 'students' && <StudentsTab exam={exam} result={result} />}
          </div>
        </div>
      </main>
      <Drawer open={settingsOpen} onClose={() => setUi({ settingsOpen: false })} title="분석 설정">
        <SettingsPanel />
      </Drawer>
    </>
  )
}
