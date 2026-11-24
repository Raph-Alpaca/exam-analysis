// @vitest-environment happy-dom
/**
 * 2026-11 종합 검토에서 재현한 결함의 회귀 테스트 (화면).
 * 모든 데이터는 합성(학생01…)이다.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useState, type ReactElement } from 'react'
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
import { Drawer } from '../src/ui/components/Drawer'

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

describe('키보드로 표 정렬', () => {
  it('정렬할 수 있는 머리칸에는 단추가 있어 키보드로 누를 수 있고, 한 번 누르면 한 번만 바뀐다', async () => {
    type R = { k: string; v: number; memo: string }
    const cols: Column<R>[] = [
      { id: 'v', header: '값', accessor: (r) => r.v, sortable: true },
      { id: 'memo', header: '메모', accessor: (r) => r.memo },
    ]
    const rows: R[] = [
      { k: 'a', v: 1, memo: 'x' },
      { k: 'b', v: 3, memo: 'y' },
      { k: 'c', v: 2, memo: 'z' },
    ]
    const c = await render(<DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />)
    const [thV, thMemo] = [...c.querySelectorAll('thead th')]
    const btn = thV!.querySelector('button')!
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.textContent).toContain('값')
    expect(thMemo!.querySelector('button')).toBeNull() // 정렬 못 하는 열은 그대로 글자
    const firstCol = () => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent)
    // 단추에서 Enter·Space 를 누르면 브라우저가 click 을 낸다
    act(() => btn.click())
    expect(thV!.getAttribute('aria-sort')).toBe('descending')
    expect(firstCol()).toEqual(['3', '2', '1'])
    act(() => btn.click())
    expect(thV!.getAttribute('aria-sort')).toBe('ascending')
    // 머리칸의 빈 곳을 마우스로 눌러도 지금처럼 정렬된다
    act(() => {
      thV!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(thV!.getAttribute('aria-sort')).toBeNull()
    expect(firstCol()).toEqual(['1', '3', '2'])
  })
})

describe('서랍(옆에서 나오는 창)', () => {
  function Harness({ second }: { second?: boolean }) {
    const [open, setOpen] = useState(false)
    const [open2, setOpen2] = useState(false)
    return (
      <div>
        <button id="opener" type="button" onClick={() => setOpen(true)}>
          열기
        </button>
        <Drawer open={open} onClose={() => setOpen(false)} title="첫째 창">
          <button id="in1" type="button">
            안쪽 단추
          </button>
          <input id="in2" aria-label="입력" />
          {second && (
            <button id="open2" type="button" onClick={() => setOpen2(true)}>
              둘째 열기
            </button>
          )}
        </Drawer>
        <Drawer open={open2} onClose={() => setOpen2(false)} title="둘째 창">
          <button id="in3" type="button">
            둘째 안쪽
          </button>
        </Drawer>
      </div>
    )
  }
  const press = (key: string, shiftKey = false) =>
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
    })
  const closeButton = (dialog: Element) => [...dialog.querySelectorAll('button')].find((b) => /닫기/.test(b.textContent ?? ''))!

  it('열리면 포커스가 안으로 들어가고, Tab 이 안에서 돌고, 닫히면 열기 전 자리로 돌아온다', async () => {
    const c = await render(<Harness />)
    const opener = c.querySelector<HTMLButtonElement>('#opener')!
    opener.focus()
    act(() => opener.click())
    const drawer = c.querySelector<HTMLElement>('[role=dialog]')!
    expect(drawer.contains(document.activeElement)).toBe(true)
    expect(drawer.getAttribute('aria-labelledby')).toBe(drawer.querySelector('h2')!.id)
    expect(document.body.style.overflow).toBe('hidden') // 뒤 화면이 같이 스크롤되지 않게

    const last = c.querySelector<HTMLElement>('#in2')!
    last.focus()
    press('Tab')
    expect(document.activeElement).toBe(closeButton(drawer)) // 끝에서 Tab → 처음으로
    press('Tab', true)
    expect(document.activeElement).toBe(last) // 처음에서 Shift+Tab → 끝으로

    press('Escape')
    expect(c.querySelector('[role=dialog]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('안에 스크롤되는 표가 있으면 Tab 으로 거기까지 갈 수 있다 (표를 건너뛰고 처음으로 돌지 않는다)', async () => {
    function WithTable() {
      const [open, setOpen] = useState(true)
      return (
        <Drawer open={open} onClose={() => setOpen(false)} title="표가 있는 창">
          <button id="last-button" type="button">
            마지막 단추
          </button>
          <div className="table-scroll" id="scroller" tabIndex={-1}>
            긴 표
          </div>
        </Drawer>
      )
    }
    const c = await render(<WithTable />)
    const drawer = c.querySelector<HTMLElement>('[role=dialog]')!
    const scroller = c.querySelector<HTMLElement>('#scroller')!
    // 내용이 넘쳐 스크롤되는 상태를 흉내 낸다 (가상 브라우저는 크기를 계산하지 않는다)
    Object.defineProperty(scroller, 'scrollHeight', { value: 746 })
    Object.defineProperty(scroller, 'clientHeight', { value: 358 })
    const tab = () => {
      const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      act(() => {
        document.activeElement!.dispatchEvent(ev)
      })
      return ev
    }
    c.querySelector<HTMLElement>('#last-button')!.focus()
    expect(tab().defaultPrevented).toBe(false) // 브라우저가 표로 넘어가게 둔다
    scroller.focus()
    expect(tab().defaultPrevented).toBe(true) // 표가 진짜 끝 → 처음으로
    expect(document.activeElement).toBe(closeButton(drawer))

    // 스크롤 상자에 Tab 이 가지 않는 브라우저에서는 포커스가 창 밖으로 빠진다 → 다시 안으로 데려온다
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    try {
      c.querySelector<HTMLElement>('#last-button')!.focus()
      expect(tab().defaultPrevented).toBe(false)
      outside.focus() // 브라우저가 뒤 화면의 단추로 옮긴 상황
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30))
      })
      expect(document.activeElement).toBe(closeButton(drawer))
    } finally {
      outside.remove()
    }
  })

  it('창 두 개가 겹쳐 열렸다가 하나만 닫혀도 뒤 화면 스크롤 잠금은 유지된다', async () => {
    const c = await render(<Harness second />)
    act(() => c.querySelector<HTMLButtonElement>('#opener')!.click())
    act(() => c.querySelector<HTMLButtonElement>('#open2')!.click())
    expect(c.querySelectorAll('[role=dialog]')).toHaveLength(2)
    expect(document.body.style.overflow).toBe('hidden')
    const second = [...c.querySelectorAll<HTMLElement>('[role=dialog]')].find((d) => d.textContent!.includes('둘째 창'))!
    act(() => closeButton(second).click())
    expect(c.querySelectorAll('[role=dialog]')).toHaveLength(1)
    expect(document.body.style.overflow).toBe('hidden')
    act(() => closeButton(c.querySelector('[role=dialog]')!).click())
    expect(document.body.style.overflow).toBe('')
  })

  it('문항 상세를 연 채 다른 탭으로 가면 그 탭에서 저절로 다시 열리지 않는다', async () => {
    await loadExam()
    window.location.hash = '#/results/items'
    const c = await render(<App />)
    act(() => useAppStore.getState().setUi({ selectedItemNo: 3 }))
    expect(c.querySelector('[role=dialog]')!.textContent).toContain('문항 3')
    await act(async () => {
      window.location.hash = '#/results/levels'
      window.dispatchEvent(new Event('hashchange'))
    })
    expect(c.querySelector('#tab-levels')!.getAttribute('aria-selected')).toBe('true')
    expect(c.querySelector('[role=dialog]')).toBeNull()
    expect(useAppStore.getState().ui.selectedItemNo).toBeNull()
  })
})

describe('파일을 엉뚱한 화면에 떨어뜨렸을 때', () => {
  /** 파일을 끄는 중이면 dataTransfer.types 에 'Files' 가 들어 있다 */
  const dropEvent = (type: 'dragover' | 'drop', files: File[] = [], types: string[] = ['Files']) => {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'dataTransfer', { value: { files, types } })
    return ev
  }

  it('글자를 끌어다 놓는 것(검색 칸에 붙이기 등)은 막지 않는다', async () => {
    await loadExam()
    window.location.hash = '#/results/students'
    await render(<App />)
    for (const type of ['dragover', 'drop'] as const) {
      const ev = dropEvent(type, [], ['text/plain'])
      act(() => {
        window.dispatchEvent(ev)
      })
      expect(ev.defaultPrevented, type).toBe(false)
    }
  })

  it('결과·사용 안내·인쇄 화면에서는 브라우저가 그 파일로 넘어가지 않게 막는다', async () => {
    await loadExam()
    for (const hash of ['#/results/overview', '#/guide', '#/print/report']) {
      window.location.hash = hash
      const c = await render(<App />)
      for (const type of ['dragover', 'drop'] as const) {
        const ev = dropEvent(type)
        act(() => {
          window.dispatchEvent(ev)
        })
        expect(ev.defaultPrevented, `${hash} ${type}`).toBe(true)
      }
      expect(useAppStore.getState().exam).not.toBeNull() // 올려 둔 자료는 그대로
      act(() => root?.unmount())
      c.remove()
    }
  })

  it('파일 올리기 화면에서는 카드 밖에 떨어뜨려도 지금처럼 받는다 (다른 화면을 거쳐 돌아온 뒤에도)', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 8, style: '_2', seed: 3, keys: KEYS, points: POINTS })
    const file = new File([aoaToXlsxBuffer(fx.aoa) as Uint8Array<ArrayBuffer>], '1반.xlsx', { type: XLSX_TYPE, lastModified: 1 })
    window.location.hash = '#/guide'
    await render(<App />)
    await act(async () => {
      window.location.hash = '#/'
      window.dispatchEvent(new Event('hashchange'))
    })
    const ev = dropEvent('drop', [file])
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(useAppStore.getState().exam).not.toBeNull(), { timeout: 20000 })
    expect(useAppStore.getState().files.map((f) => f.name)).toEqual(['1반.xlsx'])
  })
})

describe('학급 필터를 걸었을 때', () => {
  it('문항분석표 재구성의 반 선택과 학생 리포트 인쇄 단추에도 고른 반만 나온다', async () => {
    await loadExam()
    useAppStore.getState().setUi({ classFilter: ['2'] })
    let c = await render(<ResultsPage tab="classes" />)
    const select = c.querySelector('select')!
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['2반'])
    expect(select.value).toBe('2')
    expect(c.textContent).toMatch(/2반 문항분석표/)
    act(() => root?.unmount())
    c.remove()
    c = await render(<ResultsPage tab="students" />)
    const printButtons = [...c.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => /리포트 인쇄/.test(t))
    expect(printButtons).toEqual(['2반 리포트 인쇄'])
  })
})

describe('개요 화면', () => {
  it('최고점과 최저점을 보여 준다', async () => {
    await loadExam()
    const c = await render(<ResultsPage tab="overview" />)
    const tiles = Object.fromEntries([...c.querySelectorAll('.kpi')].map((k) => [k.querySelector('.kpi-label')!.textContent, k.querySelector('.kpi-value')!.textContent]))
    const totals = useAppStore.getState().exam!.classes.flatMap((cl) => cl.students.map((s) => s.neis.total))
    expect(tiles['최고점']).toBe(String(Math.max(...totals)))
    expect(tiles['최저점']).toBe(String(Math.min(...totals)))
  })
})

describe('화면 하단 안내 (문의·참고용 안내·만든 곳)', () => {
  const CONTACT = '사용하면서 불편한 점이나 개선 아이디어는 raphres@sen.go.kr로 보내 주세요.'
  const NOTICE = '공식 성적과 성취도는 NEIS 기준입니다'
  const MAKER = '서울특별시교육청 학생평가지원단 교사가 만들었습니다.'
  const count = (text: string, needle: string) => text.split(needle).length - 1

  it('파일 올리기·결과·사용 안내 화면에 문의 문구가 한 번씩 나오고, 메일 주소는 링크가 아닌 글자다', async () => {
    await loadExam()
    for (const el of [<UploadPage key="u" />, <ResultsPage key="r" tab="overview" />, <GuidePage key="g" />]) {
      const c = await render(el)
      const text = c.textContent ?? ''
      expect(count(text, CONTACT)).toBe(1)
      // 학교 PC 에는 기본 메일 프로그램이 없어 눌러도 반응이 없으므로 링크로 만들지 않는다
      expect(c.querySelector('a[href^="mailto:"]')).toBeNull()
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
