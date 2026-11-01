import { describe, expect, it } from 'vitest'
import { gridFromAoa } from './helpers.ts'
import { makeAnswerKey, makeAnswerSheet, makeItemAnalysis, makeItemInfo } from './fixtures/neis.ts'
import { detectKind } from '../src/parsers/detect'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { parseAnswerKey } from '../src/parsers/answerKey'
import { parseItemAnalysis } from '../src/parsers/itemAnalysis'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'

const STD_TEXT: Record<string, string> = {
  '[9과17-01]': '물리 변화와 화학 변화의 차이를 알고, 일상생활에서 물리 변화와 화학 변화의 예를 찾을 수 있다.',
  '[9과17-02]': '간단한 화학 반응을 화학 반응식으로 표현하고, 화학 반응식에서 계수의 비를 입자 수의 비로 해석할 수 있다.',
  '[9과17-03]': '질량 보존 법칙을 이해하고, 이를 모형을 사용하여 설명할 수 있다.',
  '[9과18-01]': '기권의 층상 구조를 이해하고, 온실 효과와 지구 온난화를 복사 평형의 관점으로 설명할 수 있다.',
}

function itemInfoSpec(n = 10) {
  const codes = Object.keys(STD_TEXT)
  return {
    nItems: n,
    keys: Array.from({ length: n }, (_, i) => (i % 5) + 1),
    points: Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 5 : 4)),
    standards: Array.from({ length: n }, (_, i) => (i === 4 ? [codes[1]!, codes[2]!] : [codes[i % codes.length]!])),
    standardText: STD_TEXT,
    domains: Array.from({ length: n }, (_, i) => `영역${(i % 3) + 1}`),
    difficulties: Array.from({ length: n }, (_, i) => (['어려움', '보통', '쉬움'] as const)[i % 3]!),
  }
}

describe('문항정보표 파서', () => {
  it('페이지 푸터와 잘린 성취기준 고아행을 처리하고 코드 2개를 나눈다', async () => {
    const spec = itemInfoSpec(10)
    const grid = await gridFromAoa(makeItemInfo({ ...spec, pageBreakAfter: 5 }))
    expect(detectKind(grid)).toBe('itemInfo')
    const p = parseItemInfo(grid, 'info.xlsx')
    expect(p.header).toMatchObject({ subject: '과학', year: '2026', semester: '1', grade: '3', examName: '중간고사' })
    expect(p.maxima.mc).toBe(spec.points.reduce((a, b) => a + b, 0))
    expect(p.items).toHaveLength(10)
    p.items.forEach((it, i) => {
      expect(it.no).toBe(i + 1)
      expect(it.key).toEqual([spec.keys[i]])
      expect(it.points).toBe(spec.points[i])
      expect(it.difficulty).toBe(spec.difficulties[i])
      expect(it.domain).toBe(spec.domains[i])
      expect(it.standards).toEqual(spec.standards[i])
    })
    // 5번 문항(페이지 끝)의 성취기준이 고아행과 합쳐져 원문이 복원됨
    const s2 = p.standards.find((s) => s.code === '[9과17-02]')!
    expect(s2.text).toBe(STD_TEXT['[9과17-02]'])
    expect(s2.itemNos).toContain(5)
    expect(p.standards.find((s) => s.code === '[9과17-03]')!.itemNos).toContain(5)
    expect(p.standards.map((s) => s.code)).toEqual(Object.keys(STD_TEXT))
  })

  it('서답형 문항 섹션을 cr 로 읽는다', async () => {
    const spec = itemInfoSpec(6)
    const grid = await gridFromAoa(makeItemInfo({ ...spec, crItems: [{ label: '서답1', points: 10, standards: ['[9과18-01]'], domain: '영역9' }] }))
    const p = parseItemInfo(grid, 'info.xlsx')
    const cr = p.items.filter((i) => i.kind === 'cr')
    expect(cr).toHaveLength(1)
    expect(cr[0]).toMatchObject({ no: 1, label: '서답1', points: 10, standards: ['[9과18-01]'], domain: '영역9' })
    expect(p.maxima.cr).toBe(10)
  })
})

describe('정답/배점표 파서', () => {
  it('가로 4블록을 읽고 복수구분을 any 로 해석한다', async () => {
    const keys = Array.from({ length: 26 }, (_, i) => (i % 5) + 1)
    const points = Array.from({ length: 26 }, (_, i) => (i % 2 ? 4 : 3))
    const grid = await gridFromAoa(makeAnswerKey({ keys, points, multi: { 7: '3' } }))
    expect(detectKind(grid)).toBe('answerKey')
    const p = parseAnswerKey(grid, 'key.xlsx')
    expect(p.header).toMatchObject({ year: '2026', semester: '2', grade: '3', examName: '3학년 기말고사', subject: '과학' })
    expect(p.items).toHaveLength(26)
    expect(p.items.map((i) => i.no)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1))
    expect(p.items[0]!.key).toEqual([1])
    expect(p.items[6]!.key).toEqual([2, 3])
    expect(p.items[6]!.keyMode).toBe('any')
    expect(p.items.map((i) => i.points)).toEqual(points)
    expect(p.maxima.mc).toBe(points.reduce((a, b) => a + b, 0))
    expect(p.maxima.total).toBe(points.reduce((a, b) => a + b, 0))
  })
})

describe('문항분석표 파서', () => {
  it('n(m) 셀과 정답률을 읽고 학년 인원을 역산한다', async () => {
    const keys = [4, 2, 2, 1, 3]
    const classCounts = [
      [2, 2, 1, 21, 0],
      [0, 25, 0, 1, 0],
      [0, 25, 1, 0, 0],
      [21, 0, 2, 2, 1],
      [0, 4, 19, 1, 2],
    ]
    const gradeCounts = [
      [6, 7, 5, 131, 2],
      [0, 138, 9, 3, 1],
      [4, 134, 3, 2, 7],
      [117, 0, 17, 3, 14],
      [3, 8, 115, 10, 15],
    ]
    const aoa = makeItemAnalysis({ keys, classCounts, gradeCounts, classBlank: [0, 0, 0, 0, 0], gradeBlank: [0, 0, 1, 0, 0] })
    const grid = await gridFromAoa(aoa, { merges: [{ s: { r: 10, c: 7 }, e: { r: 10, c: 9 } }] })
    expect(detectKind(grid)).toBe('itemAnalysis')
    const p = parseItemAnalysis(grid, 'ana.xlsx')
    expect(p.header).toMatchObject({ year: '2026', semester: '1', grade: '3', examName: '중간고사', subject: '과학' })
    expect(p.items).toHaveLength(5)
    expect(p.classN).toBe(26)
    expect(p.gradeN).toBe(151)
    expect(p.items[0]!.classCounts).toEqual({ 1: 2, 2: 2, 3: 1, 4: 21, 5: 0, none: 0 })
    expect(p.items[0]!.gradeCounts).toEqual({ 1: 6, 2: 7, 3: 5, 4: 131, 5: 2, none: 0 })
    expect(p.items[0]!.classP).toBeCloseTo(80.77, 2)
    expect(p.items[0]!.gradeP).toBeCloseTo(86.75, 2)
    expect(p.items[2]!.gradeCounts.none).toBe(1)
  })
})

describe('buildExam', () => {
  async function parsedSet(opts: { classes?: number[]; withInfo?: boolean; withKey?: boolean; breakKey?: boolean } = {}): Promise<ParsedFile[]> {
    const n = 10
    const spec = itemInfoSpec(n)
    const files: ParsedFile[] = []
    for (const c of opts.classes ?? [1, 2]) {
      const fx = makeAnswerSheet({ classNo: c, nItems: n, nStudents: 12, style: '_2', seed: 100 + c, keys: opts.breakKey && c === 2 ? spec.keys.map((k) => (k % 5) + 1) : spec.keys, points: spec.points })
      const grid = await gridFromAoa(fx.aoa)
      files.push({ fileName: `c${c}.xlsx`, kind: 'answers', answers: parseAnswerSheet(grid, `c${c}.xlsx`) })
    }
    if (opts.withInfo) {
      const grid = await gridFromAoa(makeItemInfo(spec))
      files.push({ fileName: 'info.xlsx', kind: 'itemInfo', itemInfo: parseItemInfo(grid, 'info.xlsx') })
    }
    if (opts.withKey) {
      const grid = await gridFromAoa(makeAnswerKey({ keys: spec.keys, points: spec.points }))
      files.push({ fileName: 'key.xlsx', kind: 'answerKey', answerKey: parseAnswerKey(grid, 'key.xlsx') })
    }
    return files
  }

  it('정오표만으로 시험을 만든다', async () => {
    const { exam, errors } = buildExam(await parsedSet())
    expect(errors).toEqual([])
    expect(exam!.classes.map((c) => c.classNo)).toEqual(['1', '2'])
    expect(exam!.items).toHaveLength(10)
    expect(exam!.hasItemInfo).toBe(false)
    expect(exam!.standards).toEqual([])
    expect(exam!.header).toMatchObject({ subject: '과학', examName: '중간고사' })
    expect(exam!.header.classNo).toBeUndefined()
  })

  it('문항정보표·정답배점표가 있으면 보강하고 불일치는 경고한다', async () => {
    const { exam, errors, warnings } = buildExam(await parsedSet({ withInfo: true, withKey: true }))
    expect(errors).toEqual([])
    expect(exam!.hasItemInfo).toBe(true)
    expect(exam!.standards.length).toBe(4)
    expect(exam!.items[4]!.standards).toEqual(['[9과17-02]', '[9과17-03]'])
    expect(exam!.items[0]!.difficulty).toBe('어려움')
    expect(warnings.filter((w) => /mismatch/.test(w.code))).toEqual([])
  })

  it('정답이 다른 정오표가 섞이면 오류', async () => {
    const { exam, errors } = buildExam(await parsedSet({ breakKey: true }))
    expect(exam).toBeNull()
    expect(errors[0]!.code).toBe('key-mismatch')
  })

  it('정오표가 없으면 오류', () => {
    const { exam, errors } = buildExam([])
    expect(exam).toBeNull()
    expect(errors[0]!.code).toBe('no-answers')
  })
})
