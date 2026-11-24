// @vitest-environment happy-dom
/**
 * 2026-11 종합 검토에서 재현한 결함의 회귀 테스트 (화면).
 * 모든 데이터는 합성(학생01…)이다.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { aoaToXlsxBuffer, gridFromAoa } from './helpers.ts'
import { makeAnswerSheet } from './fixtures/neis.ts'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'
import { DEFAULT_SETTINGS, type Settings } from '../src/model/settings'
import { useAppStore } from '../src/ui/store/useAppStore'
import { loadDemoFiles } from '../src/ui/store/demo'
import { App } from '../src/ui/app/App'
import { ResultsPage } from '../src/ui/pages/ResultsPage'
import { UploadPage } from '../src/ui/pages/UploadPage'
import { GuidePage } from '../src/ui/pages/GuidePage'
import { PrintReportPage } from '../src/ui/pages/PrintReportPage'
import { SettingsPanel } from '../src/ui/pages/SettingsPanel'
import { DataTable, type Column } from '../src/ui/components/DataTable'
import { InlineBar } from '../src/ui/components/basic'

vi.mock('../src/ui/store/demo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/store/demo')>()
  return { ...actual, loadDemoFiles: vi.fn(actual.loadDemoFiles) }
})

// 서답형 탭이 그리다가 예외를 내는 상황을 만들 수 있게 한다 (오류 화면 복구 테스트용)
const crash = vi.hoisted(() => ({ constructedTab: false }))
vi.mock('../src/ui/pages/tabs/ConstructedTab', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/pages/tabs/ConstructedTab')>()
  const { createElement } = await import('react')
  return {
    ...actual,
    ConstructedTab: (props: Parameters<typeof actual.ConstructedTab>[0]) => {
      if (crash.constructedTab) throw new Error('테스트용 오류')
      return createElement(actual.ConstructedTab, props)
    },
  }
})

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const KEYS = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
const POINTS = Array(10).fill(10)

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  }
})

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
  useAppStore.getState().clearAll()
  useAppStore.getState().resetSettings()
  vi.mocked(loadDemoFiles).mockClear()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  vi.unstubAllGlobals()
})

async function render(el: ReactElement): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(el)
  })
  return container
}

async function loadExam(settings: Partial<Settings> = {}, subject = '과학') {
  const files: ParsedFile[] = []
  for (const c of [1, 2]) {
    const fx = makeAnswerSheet({ classNo: c, nItems: 10, nStudents: 15, style: '_2', seed: 80 + c, keys: KEYS, points: POINTS, subject })
    files.push({ fileName: `${c}반.xlsx`, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), `${c}반.xlsx`) })
  }
  const { exam, errors } = buildExam(files)
  expect(errors).toEqual([])
  useAppStore.setState({ exam, settings: { ...DEFAULT_SETTINGS, ...settings }, buildErrors: [], buildWarnings: [] })
}

/** React 가 알아차리도록 입력 칸의 값을 바꾼다 */
function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  act(() => {
    setter!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('표 정렬', () => {
  it('내림차순에서도 빈 값은 맨 아래로 간다', async () => {
    type R = { k: string; v: number | null }
    const cols: Column<R>[] = [{ id: 'v', header: '값', accessor: (r) => r.v, sortable: true }]
    const rows: R[] = [
      { k: 'a', v: 1 },
      { k: 'b', v: null },
      { k: 'c', v: 3 },
    ]
    const c = await render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />)
    const cells = () => [...c.querySelectorAll('tbody td')].map((td) => td.textContent)
    const th = c.querySelector('thead th')!
    act(() => {
      th.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(th.getAttribute('aria-sort')).toBe('descending')
    expect(cells()).toEqual(['3', '1', ''])
    act(() => {
      th.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(th.getAttribute('aria-sort')).toBe('ascending')
    expect(cells()).toEqual(['1', '3', ''])
  })
})

describe('답지반응률 막대', () => {
  it('숫자가 화면낭독기에서 숨겨지지 않는다', async () => {
    const c = await render(<InlineBar value={12.34} />)
    const num = c.querySelector('b')!
    expect(num.textContent).toBe('12.3')
    expect(num.closest('[aria-hidden="true"]')).toBeNull()
  })
})

describe('분석 설정', () => {
  it('분할점수 칸을 비우거나 순서가 틀린 값은 분석에 적용하지 않는다', async () => {
    await loadExam()
    const c = await render(<SettingsPanel />)
    const ab = c.querySelector<HTMLInputElement>('#cut-AB')!
    typeInto(ab, '')
    expect(useAppStore.getState().settings.cutoffs.AB).toBe(90) // 0 이 되어 전원 A 가 되면 안 된다
    typeInto(ab, '75') // B/C(80)보다 낮음
    expect(useAppStore.getState().settings.cutoffs.AB).toBe(90)
    expect(c.textContent).toMatch(/적용하지 않았습니다/)
    typeInto(ab, '85')
    expect(useAppStore.getState().settings.cutoffs.AB).toBe(85)
    expect(c.textContent).not.toMatch(/적용하지 않았습니다/)
  })

  it('성취기준 도달 기준도 0~100 을 벗어나거나 빈 값이면 적용하지 않는다', async () => {
    await loadExam()
    const c = await render(<SettingsPanel />)
    const pass = c.querySelector<HTMLInputElement>('#pass')!
    typeInto(pass, '')
    expect(useAppStore.getState().settings.standardPassPct).toBe(80)
    typeInto(pass, '150')
    expect(useAppStore.getState().settings.standardPassPct).toBe(80)
    typeInto(pass, '70')
    expect(useAppStore.getState().settings.standardPassPct).toBe(70)
  })

  it('브라우저에 잘못 저장돼 있던 분할점수는 불러올 때 기본값으로 되돌린다', async () => {
    const bad = { ...DEFAULT_SETTINGS, levelScheme: 'three', cutoffs: { AB: 0, BC: 80, CD: 70, DE: 60 }, cutoffs3: { AB: 50, BC: 60 }, standardPassPct: 150 }
    localStorage.setItem('exam-analysis-settings-v1', JSON.stringify({ state: { settings: bad }, version: 0 }))
    await useAppStore.persist.rehydrate()
    const s = useAppStore.getState().settings
    expect(s.cutoffs).toEqual(DEFAULT_SETTINGS.cutoffs)
    expect(s.cutoffs3).toEqual(DEFAULT_SETTINGS.cutoffs3)
    expect(s.standardPassPct).toBe(DEFAULT_SETTINGS.standardPassPct)
    expect(s.levelScheme).toBe('three') // 올바른 값은 그대로 둔다
  })
})

describe('결과 화면의 탭', () => {
  it('탭을 바꿔도 화면 전체를 다시 그리지 않아 화살표 키로 계속 옮겨 갈 수 있다', async () => {
    await loadExam()
    window.location.hash = '#/results/overview'
    const c = await render(<App />)
    const tablist = c.querySelector('[role=tablist]')!
    const first = c.querySelector<HTMLButtonElement>('#tab-overview')!
    first.focus()
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      window.dispatchEvent(new Event('hashchange'))
    })
    expect(window.location.hash).toBe('#/results/classes')
    expect(c.querySelector('#tab-classes')!.getAttribute('aria-selected')).toBe('true')
    expect(c.querySelector('[role=tablist]')).toBe(tablist)
    expect(document.activeElement?.id).toBe('tab-classes')
  })

  it('한 탭에서 오류가 나도 다른 탭으로 옮기면 오류 화면이 풀린다', async () => {
    await loadExam()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    crash.constructedTab = true
    try {
      window.location.hash = '#/results/constructed'
      const c = await render(<App />)
      expect(c.textContent).toContain('문제가 생겼습니다')
      await act(async () => {
        window.location.hash = '#/results/overview'
        window.dispatchEvent(new Event('hashchange'))
      })
      expect(c.textContent).not.toContain('문제가 생겼습니다')
      expect(c.querySelector('#tab-overview')!.getAttribute('aria-selected')).toBe('true')
    } finally {
      crash.constructedTab = false
      quiet.mockRestore()
    }
  })

  it('3단계(A·B·C) 교과에서는 학급별 성취수준 그래프에 D·E 가 나오지 않는다', async () => {
    await loadExam({ levelScheme: 'three' }, '음악')
    const c = await render(<ResultsPage tab="classes" />)
    const chart = c.querySelector('[aria-label="집단별 성취수준 비율"]')!
    const texts = [...chart.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('A')
    expect(texts).not.toContain('D')
    expect(texts).not.toContain('E')
  })
})

describe('화면 하단 안내 (문의·참고용 안내·만든 곳)', () => {
  const CONTACT = '사용하면서 불편한 점이나 개선 아이디어는 raphres@sen.go.kr로 보내 주세요.'
  const NOTICE = '공식 성적과 성취도는 NEIS 기준입니다'
  const MAKER = '서울특별시교육청 학생평가지원단 교사가 만들었습니다.'
  const count = (text: string, needle: string) => text.split(needle).length - 1

  it('파일 올리기·결과·사용 안내 화면에 문의 문구가 한 번씩 나오고 메일 주소는 링크다', async () => {
    await loadExam()
    for (const el of [<UploadPage key="u" />, <ResultsPage key="r" tab="overview" />, <GuidePage key="g" />]) {
      const c = await render(el)
      const text = c.textContent ?? ''
      expect(count(text, CONTACT)).toBe(1)
      expect(c.querySelector('a[href="mailto:raphres@sen.go.kr"]')).not.toBeNull()
      const foot = c.querySelector('footer.site-foot')!
      expect(foot.textContent).toContain(NOTICE)
      expect(foot.textContent).toContain(MAKER)
      act(() => root?.unmount())
      c.remove()
    }
  })

  it('사용 안내에는 "문의" 항목이 따로 있다', async () => {
    const c = await render(<GuidePage />)
    const h = [...c.querySelectorAll('h2')].find((x) => x.textContent === '문의')!
    expect(h.parentElement!.textContent).toContain(CONTACT)
  })

  it('인쇄용 보고서 화면에는 넣지 않는다', async () => {
    await loadExam()
    const c = await render(<PrintReportPage />)
    expect(c.querySelector('footer.site-foot')).toBeNull()
    expect(c.textContent).not.toContain('raphres@sen.go.kr')
  })
})

describe('예시 데이터', () => {
  it('#/?demo=1 로 들어와 "모두 지우기"를 하면 예시가 다시 들어오지 않는다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 8, style: '_2', seed: 3, keys: KEYS, points: POINTS })
    vi.mocked(loadDemoFiles).mockImplementation(async () => [new File([aoaToXlsxBuffer(fx.aoa) as Uint8Array<ArrayBuffer>], '예시.xlsx', { type: XLSX_TYPE, lastModified: 0 })])
    window.location.hash = '#/?demo=1'
    await render(<App />)
    await vi.waitFor(() => expect(useAppStore.getState().exam).not.toBeNull(), { timeout: 20000 })
    expect(loadDemoFiles).toHaveBeenCalledTimes(1)
    await act(async () => {
      useAppStore.getState().clearAll()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(loadDemoFiles).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().files).toEqual([])
    // 다른 예시 링크로 옮겨 가면(새로고침 없이) 다시 불러온다
    await act(async () => {
      window.location.hash = '#/results/overview?demo=1'
      window.dispatchEvent(new Event('hashchange'))
    })
    await vi.waitFor(() => expect(useAppStore.getState().exam).not.toBeNull(), { timeout: 20000 })
    expect(loadDemoFiles).toHaveBeenCalledTimes(2)
  })

  it('두 번 불러와도 같은 파일로 알아본다 (파일 목록에 두 벌이 쌓이지 않는다)', async () => {
    const actual = await vi.importActual<typeof import('../src/ui/store/demo')>('../src/ui/store/demo')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (String(url).endsWith('manifest.json') ? new Response(JSON.stringify({ files: ['a.xlsx'] })) : new Response(new Uint8Array([1, 2, 3])))),
    )
    const a = await actual.loadDemoFiles()
    await new Promise((r) => setTimeout(r, 15))
    const b = await actual.loadDemoFiles()
    expect(a[0]!.lastModified).toBe(b[0]!.lastModified)
  })
})
