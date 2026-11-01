import { describe, expect, it } from 'vitest'
import type { Exam, Student } from '../src/model/types'
import { DEFAULT_SETTINGS } from '../src/model/settings'
import { mean, pearson, sd, variance } from '../src/stats/descriptive'
import { assignLevel } from '../src/stats/levels'
import { cronbachAlpha } from '../src/stats/reliability'
import { analyze } from '../src/stats/analyze'

function student(classNo: string, seatNo: number, cells: ('.' | '-' | number)[], total: number): Student {
  return {
    id: `${classNo}/${seatNo}`,
    classNo,
    seatNo,
    studentId: `990${classNo}${String(seatNo).padStart(5, '0')}`,
    name: `학생${seatNo}`,
    responses: cells.map((c) => (c === '.' ? { k: 'correct' } : c === '-' ? { k: 'blank' } : { k: 'wrong', choice: c })),
    neis: { mc: total, cr: 0, etc: 0, total },
  }
}

/** 손으로 계산한 5명 × 3문항 */
function tinyExam(): Exam {
  const students = [
    student('1', 1, ['.', '.', '.'], 10),
    student('1', 2, ['.', 1, '.'], 7),
    student('1', 3, [3, '.', '-'], 3),
    student('1', 4, [2, 4, 1], 0),
    student('1', 5, ['.', '.', 5], 5),
  ]
  return {
    header: { raw: '', subject: '과학' },
    items: [
      { no: 1, kind: 'mc', label: '1', points: 2, key: [1], keyMode: 'single', standards: ['[S-1]'], domain: '영역A', difficulty: '쉬움' },
      { no: 2, kind: 'mc', label: '2', points: 3, key: [2], keyMode: 'single', standards: ['[S-1]'], domain: '영역A', difficulty: '보통' },
      { no: 3, kind: 'mc', label: '3', points: 5, key: [3], keyMode: 'single', standards: ['[S-2]'], domain: '영역B', difficulty: '어려움' },
    ],
    maxima: { mc: 10, cr: 0, etc: 0, bonus: 0, total: 10 },
    classes: [{ classNo: '1', header: { raw: '' }, students, source: { fileName: 't.xlsx' } }],
    standards: [
      { code: '[S-1]', text: '첫째 기준', domain: '영역A', itemNos: [1, 2] },
      { code: '[S-2]', text: '둘째 기준', domain: '영역B', itemNos: [3] },
    ],
    hasItemInfo: true,
    warnings: [],
    sources: ['t.xlsx'],
  }
}

describe('기술통계', () => {
  it('평균·분산·표준편차(모집단/표본)·상관', () => {
    const xs = [10, 7, 3, 0, 5]
    expect(mean(xs)).toBe(5)
    expect(variance(xs, 'population')).toBeCloseTo(11.6, 10)
    expect(variance(xs, 'sample')).toBeCloseTo(14.5, 10)
    expect(sd(xs, 'population')).toBeCloseTo(Math.sqrt(11.6), 10)
    expect(sd([], 'population')).toBeNull()
    expect(sd([1], 'sample')).toBeNull()
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it('성취수준은 분할점수 이상일 때 해당 수준', () => {
    const c = DEFAULT_SETTINGS.cutoffs
    expect(assignLevel(100, c)).toBe('A')
    expect(assignLevel(90, c)).toBe('A')
    expect(assignLevel(89.99, c)).toBe('B')
    expect(assignLevel(80, c)).toBe('B')
    expect(assignLevel(70, c)).toBe('C')
    expect(assignLevel(60, c)).toBe('D')
    expect(assignLevel(59.9, c)).toBe('E')
    expect(assignLevel(0, c)).toBe('E')
  })
  it('Cronbach α (KR-20)', () => {
    const rows = [
      [1, 1, 1],
      [1, 0, 1],
      [0, 1, 0],
      [0, 0, 0],
      [1, 1, 0],
    ]
    expect(cronbachAlpha(rows)).toBeCloseTo(0.4615, 3)
    expect(cronbachAlpha([[1, 1]])).toBeNull()
  })
})

describe('analyze (손계산 세트)', () => {
  const r = analyze(tinyExam(), DEFAULT_SETTINGS)

  it('개요: 평균·표준편차·성취수준 분포·신뢰도', () => {
    expect(r.overview.n).toBe(5)
    expect(r.overview.total.mean).toBe(5)
    expect(r.overview.total.sd).toBeCloseTo(Math.sqrt(11.6), 10)
    expect(r.overview.levelCounts).toEqual({ A: 1, B: 0, C: 1, D: 0, E: 3 })
    expect(r.overview.levelPct.E).toBe(60)
    expect(r.overview.alphaMc).toBeCloseTo(0.4615, 3)
    expect(r.byClass['1']!.n).toBe(5)
    expect(r.byLevel.A.total.mean).toBe(10)
    expect(r.byLevel.B.total.mean).toBeNull()
  })

  it('문항: 정답률·답지반응·변별도·난이도·플래그', () => {
    const i1 = r.items[0]!
    expect(i1.p).toBe(60)
    expect(i1.counts).toEqual({ 1: 3, 2: 1, 3: 1, 4: 0, 5: 0, none: 0 })
    expect(i1.pct[1]).toBe(60)
    expect(i1.disc).toBeCloseTo(0.7119, 3)
    expect(i1.observed3).toBe('보통')
    expect(i1.expected).toBe('쉬움')
    expect(i1.flags.map((f) => f.code)).toContain('expect-mismatch')
    const i3 = r.items[2]!
    expect(i3.p).toBe(40)
    expect(i3.counts).toEqual({ 1: 1, 2: 0, 3: 2, 4: 0, 5: 1, none: 1 })
    expect(i3.blank).toBe(1)
    expect(i3.pct.none).toBe(20)
    expect(i3.flags.map((f) => f.code)).toContain('low-p')
    expect(i3.flags.map((f) => f.code)).toContain('high-none')
  })

  it('표본 표준편차 설정', () => {
    const rs = analyze(tinyExam(), { ...DEFAULT_SETTINGS, sdMode: 'sample' })
    expect(rs.overview.total.sd).toBeCloseTo(Math.sqrt(14.5), 10)
  })

  it('성취수준별 문항 통계와 상·하위 문항', () => {
    expect(r.itemsByLevel.E[0]!.n).toBe(3)
    expect(r.itemsByLevel.E[0]!.p).toBeCloseTo(33.333, 2)
    expect(r.itemsByLevel.E[0]!.disc).toBeNull() // n<5
    expect(r.topBottom.all.top).toEqual([1, 2, 3])
    expect(r.topBottom.all.bottom).toEqual([3, 1, 2])
  })

  it('성취기준·내용영역 성취율', () => {
    const s1 = r.standards.find((s) => s.code === '[S-1]')!
    expect(s1.maxPoints).toBe(5)
    expect(s1.itemNos).toEqual([1, 2])
    expect(s1.overall.rate).toBeCloseTo(60, 10) // (5+2+3+0+5)/5 = 3 → 60%
    expect(s1.byLevel.A.rate).toBe(100)
    expect(s1.byClass['1']!.rate).toBeCloseTo(60, 10)
    const dB = r.domains.find((d) => d.code === '영역B')!
    expect(dB.overall.rate).toBeCloseTo(40, 10)
  })

  it('학생별 결과', () => {
    const s3 = r.students[2]!
    expect(s3.level).toBe('E')
    expect(s3.total).toBe(3)
    expect(s3.wrongItems.map((w) => w.no)).toEqual([1, 3])
    expect(s3.wrongItems[1]!.response).toEqual({ k: 'blank' })
    expect(s3.standards.find((x) => x.code === '[S-1]')!.rate).toBe(60)
    expect(s3.standards.find((x) => x.code === '[S-2]')!.status).toBe('미도달')
    const s1 = r.students[0]!
    expect(s1.level).toBe('A')
    expect(s1.wrongItems).toEqual([])
    expect(s1.standards.every((x) => x.status === '도달')).toBe(true)
  })

  it('히스토그램 구간', () => {
    const total = r.histogram.reduce((a, b) => a + b.count, 0)
    expect(total).toBe(5)
    expect(r.histogram[r.histogram.length - 1]!.count).toBe(1) // 100점
    expect(r.histogram[0]!.count).toBe(1) // 0점
  })

  it('학급 필터', () => {
    const ex = tinyExam()
    ex.classes.push({ classNo: '2', header: { raw: '' }, students: [student('2', 1, ['.', '.', '.'], 10)], source: { fileName: 'c2.xlsx' } })
    const all = analyze(ex, DEFAULT_SETTINGS)
    expect(all.overview.n).toBe(6)
    const only2 = analyze(ex, DEFAULT_SETTINGS, { classFilter: ['2'] })
    expect(only2.overview.n).toBe(1)
    expect(only2.classNos).toEqual(['2'])
  })
})
