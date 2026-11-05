import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useAnalysis } from '../store/useAnalysis'
import { navigate } from '../app/router'
import { Tabs } from '../components/Tabs'
import { Drawer } from '../components/Drawer'
import { EmptyState, WarningList } from '../components/basic'
import { Icon, OmrMark } from '../components/Icon'
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
    <div className="filter-row class-filter">
      <span className="label" id="class-filter-label">
        학급
      </span>
      <div className="seg" role="group" aria-labelledby="class-filter-label">
        <button type="button" onClick={() => setUi({ classFilter: [] })} aria-pressed={all}>
          전체
        </button>
        {exam.classes.map((c) => {
          const on = !all && classFilter.includes(c.classNo)
          return (
            <button key={c.classNo} type="button" onClick={() => toggle(c.classNo)} aria-pressed={on}>
              {c.classNo}반
            </button>
          )
        })}
      </div>
      {!all && <span className="small muted">고른 반만 집계합니다</span>}
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
      <>
        <header className="topbar">
          <div className="container topbar-inner">
            <a className="brand" href="#/">
              <OmrMark />
              <span className="label">성취평가 결과 분석</span>
            </a>
          </div>
        </header>
        <main className="container page">
          <EmptyState>
            <p>분석할 자료가 없습니다. 개인정보 보호를 위해 자료를 저장하지 않으므로, 새로고침하면 파일을 다시 올려야 합니다.</p>
            <a className="btn btn-primary" href="#/">
              <Icon name="upload" />
              파일 올리기
            </a>
          </EmptyState>
        </main>
      </>
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
        <div className="container topbar-inner">
          <a className="brand" href="#/">
            <OmrMark />
            <span className="label">성취평가 결과 분석</span>
          </a>
          <div className="actions">
            <a className="btn btn-sm btn-ghost" href="#/" title="파일 바꾸기">
              <Icon name="upload" />
              <span className="label">파일 바꾸기</span>
            </a>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setUi({ settingsOpen: true })} title="설정">
              <Icon name="sliders" />
              <span className="label">설정</span>
            </button>
            <button type="button" className="btn btn-sm" onClick={doExport} disabled={exporting} title="엑셀로 내보내기">
              <Icon name={exporting ? 'spinner' : 'download'} />
              <span className="label">{exporting ? '만드는 중' : '엑셀로 내보내기'}</span>
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('/print/report')} title="보고서 인쇄">
              <Icon name="printer" />
              <span className="label">보고서 인쇄</span>
            </button>
          </div>
        </div>
      </header>
      <div className="container page-head">
        <h1>{describeHeader(exam.header)}</h1>
        <dl className="facts">
          <div>
            <dt>학생</dt>
            <dd>{studentCount}명</dd>
          </div>
          <div>
            <dt>학급</dt>
            <dd>{exam.classes.length}개 반</dd>
          </div>
          <div>
            <dt>선다형</dt>
            <dd>{result.mcCount}문항</dd>
          </div>
          {result.crCount > 0 && (
            <div>
              <dt>서답형</dt>
              <dd>{result.crCount}문항</dd>
            </div>
          )}
          <div>
            <dt>만점</dt>
            <dd>{exam.maxima.total}점</dd>
          </div>
        </dl>
      </div>
      <div className="tabbar">
        <div className="container">
          <Tabs tabs={tabs} active={activeTab} onChange={(id) => navigate(`/results/${id}`)} ariaLabel="분석 탭" />
        </div>
      </div>
      <main className="container page">
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
