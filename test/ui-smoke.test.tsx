// @vitest-environment happy-dom
/**
 * 화면 렌더링 점검: 여러 변형 자료로 모든 탭·드로어·인쇄 화면·엑셀 내보내기를 가상 브라우저(happy-dom)에서
 * 실제로 그려 보고(차트 초기화 포함) 예외가 없는지 확인한다.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { gridFromAoa } from './helpers.ts'
import { itemAnalysisFromSheets, makeAnswerKey, makeAnswerSheet, makeItemAnalysis, makeItemInfo, type AnswerSheetFixture } from './fixtures/neis.ts'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { parseAnswerKey } from '../src/parsers/answerKey'
import { parseItemAnalysis } from '../src/parsers/itemAnalysis'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'
import { analyze } from '../src/stats/analyze'
import { DEFAULT_SETTINGS, type Settings } from '../src/model/settings'
import type { Exam } from '../src/model/types'
import { buildWorkbook } from '../src/export/excel'
import { useAppStore } from '../src/ui/store/useAppStore'
import { ResultsPage, type ResultTab } from '../src/ui/pages/ResultsPage'
import { PrintReportPage } from '../src/ui/pages/PrintReportPage'
import { PrintStudentsPage } from '../src/ui/pages/PrintStudentsPage'
import { UploadPage } from '../src/ui/pages/UploadPage'

let root: Root | null = null
let container: HTMLDivElement | null = null
const errors: unknown[] = []

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  }
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args)
  })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
})

/** 컴포넌트를 그리고 화면 글자를 돌려준다. React 오류(console.error)가 있으면 실패. */
async function render(el: ReactElement): Promise<string> {
  if (root) act(() => root!.unmount())
  container?.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  errors.length = 0
  await act(async () => {
    root!.render(el)
  })
  const text = container.textContent ?? ''
  if (errors.length) throw new Error(`렌더링 중 오류: ${JSON.stringify(errors[0]).slice(0, 500)}`)
  return text
}

const STD = {
  '[9과17-01]': '물리 변화와 화학 변화의 차이를 알고, 일상생활에서 물리 변화와 화학 변화의 예를 찾을 수 있다.',
  '[9과17-02]': '간단한 화학 반응을 화학 반응식으로 표현하고, 화학 반응식에서 계수의 비를 입자 수의 비로 해석할 수 있다.',
  '[9사(지리)01-01]': '지도의 기본 요소를 이해하고, 지리 정보를 수집하여 지도로 표현할 수 있다.',
}
const codes = Object.keys(STD)

async function answers(fx: AnswerSheetFixture, name: string, bogus = false): Promise<ParsedFile> {
  return { fileName: name, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa, { bogusRef: bogus }), name) }
}

interface Scenario {
  name: string
  files: () => Promise<ParsedFile[]>
  settings?: Partial<Settings>
}

const N = 10
const keys = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
const points = Array(N).fill(6)

const scenarios: Scenario[] = [
  {
    name: '정오표 2개 반 + 정답배점표 + 문항분석표(XLS data)',
    files: async () => {
      const sh = [1, 2].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 15, style: '_1', seed: c, keys, points: Array(N).fill(10) }))
      const ia = makeItemAnalysis(itemAnalysisFromSheets(sh, 0, { layout: 'data' }))
      return [
        await answers(sh[0]!, '1반.xlsx', true),
        await answers(sh[1]!, '2반.xlsx', true),
        { fileName: 'key.xlsx', kind: 'answerKey' as const, answerKey: parseAnswerKey(await gridFromAoa(makeAnswerKey({ keys, points: Array(N).fill(10), examName: '중간고사' })), 'key.xlsx') },
        { fileName: 'ia.xlsx', kind: 'itemAnalysis' as const, itemAnalysis: parseItemAnalysis(await gridFromAoa(ia), 'ia.xlsx') },
      ]
    },
  },
  {
    name: '문항정보표(성취기준) + 서답형 문항별 열 + 복수정답',
    files: async () => {
      const crCols = [
        { label: '서답1', points: 10 },
        { label: '서답2', points: 10 },
      ]
      const sh = [1, 2, 3].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 12, style: '_2', seed: 10 + c, keys, points: Array(N).fill(8), crCols, multiKeyItems: { 4: 'B' } }))
      const info = makeItemInfo({
        nItems: N,
        keys,
        points: Array(N).fill(8),
        standards: Array.from({ length: N }, (_, i) => (i === 2 ? [codes[0]!, codes[1]!] : [codes[i % 3]!])),
        standardText: STD,
        domains: Array.from({ length: N }, (_, i) => `영역${i % 2}`),
        difficulties: Array.from({ length: N }, (_, i) => (['어려움', '보통', '쉬움'] as const)[i % 3]!),
        crItems: [
          { label: '서답1', points: 10, standards: [codes[0]!], domain: '영역0' },
          { label: '서답2', points: 10, standards: [codes[2]!], domain: '영역1' },
        ],
        pageBreakAfter: 5,
      })
      return [...(await Promise.all(sh.map((s, i) => answers(s, `${i + 1}반.xlsx`)))), { fileName: 'info.xlsx', kind: 'itemInfo' as const, itemInfo: parseItemInfo(await gridFromAoa(info), 'info.xlsx') }]
    },
  },
  {
    name: '서답형 총점만 + 결시·인정점 + 강의실 + 학번 먼저',
    files: async () => {
      const sh = [3, 4].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 14, style: '_1', seed: 30 + c, keys, points, crTotalMax: 40, classLabel: '강의실', idFirst: true, absent: c === 3 ? [2] : [], recognized: c === 4 ? [5] : [] }))
      return Promise.all(sh.map((s, i) => answers(s, `${i}.xlsx`, true)))
    },
  },
  {
    name: '결시생 포함 설정',
    settings: { excludeNoResponse: false, sdMode: 'sample', levelBasis: 'mcMax', scoreSource: 'recomputed', uploadedIsWholeGrade: true },
    files: async () => [await answers(makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 9, style: '_2', seed: 5, keys, points, absent: [0, 1] }), 'a.xlsx')],
  },
  {
    name: '한 반 전체 결시 (분석할 학생 0명)',
    files: async () => [await answers(makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 4, style: '_2', seed: 6, keys, points, absent: [0, 1, 2, 3] }), 'a.xlsx')],
  },
]

const TABS: ResultTab[] = ['overview', 'classes', 'items', 'levels', 'standards', 'constructed', 'students']

describe('화면 렌더링 점검', () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      const files = await sc.files()
      const { exam, errors } = buildExam(files)
      expect(errors).toEqual([])
      const e = exam as Exam
      const settings = { ...DEFAULT_SETTINGS, ...sc.settings }
      const result = analyze(e, settings)
      const firstStudent = result.students[0]?.student.id ?? null
      useAppStore.setState({
        exam: e,
        settings,
        buildErrors: [],
        buildWarnings: [],
        files: files.map((f, i) => ({ id: `t${i}`, name: f.fileName, size: 1, lastModified: 0, status: 'ok' as const, kind: f.kind, label: f.kind, parsed: f })),
        ui: { classFilter: [], selectedItemNo: 1, selectedStudentId: firstStudent, selectedLevel: 'A', settingsOpen: true, printSections: {} },
      })
      const expectText: Record<ResultTab, RegExp> = {
        overview: /성취수준 분포[\s\S]*점수 분포[\s\S]*성취수준별 평균·표준편차/,
        classes: /학급별 성취도[\s\S]*문항 × 학급 정답률[\s\S]*문항분석표 재구성/,
        items: /선다형 문항 분석[\s\S]*문항 1/, // 1번 문항 상세 드로어까지
        levels: /문항 × 성취수준 정답률/,
        standards: e.hasItemInfo ? /성취기준별 성취율[\s\S]*내용영역별 분석/ : /문항정보표/,
        constructed: e.maxima.cr > 0 ? /서답형/ : /서답형 문항이 없습니다/,
        students: firstStudent ? /학생별 결과[\s\S]*학생 리포트/ : /학생별 결과/,
      }
      for (const tab of TABS) {
        const text = await render(<ResultsPage tab={tab} />)
        expect(text, tab).toContain('분석 설정') // 설정 드로어가 열린 상태로 그려짐
        expect(text, tab).not.toContain('분석할 자료가 없습니다')
        expect(text, tab).toMatch(expectText[tab])
      }
      // 학급 필터를 건 상태, 수준 선택 없음
      useAppStore.setState({ ui: { ...useAppStore.getState().ui, classFilter: [e.classes[0]!.classNo], selectedLevel: 'all', settingsOpen: false } })
      for (const tab of TABS) await render(<ResultsPage tab={tab} />)
      expect(await render(<PrintReportPage />)).toContain('성취평가 결과 분석 보고서')
      expect(await render(<PrintStudentsPage classNo={e.classes[0]!.classNo} />)).toContain('학생 리포트')
      if (firstStudent) expect(await render(<PrintStudentsPage studentId={firstStudent} />)).toContain(result.students[0]!.student.name)
      expect(await render(<UploadPage />)).toContain('올린 파일')
      const wb = await buildWorkbook(e, result, settings)
      const buf = await wb.xlsx.writeBuffer()
      expect(buf.byteLength).toBeGreaterThan(5000)
    })
  }
})
