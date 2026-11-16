/**
 * 과학 외 교과에서 나올 수 있는 양식 변형 검증: 서답형 구역 표기, 서답형 점수 열 이름,
 * 공백이 있는 교과목명, 복수정답 문항의 문항분석표 대조, 3단계(A·B·C) 성취수준.
 * 모든 데이터는 합성(학생01…)이다.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { gridFromAoa } from './helpers.ts'
import { itemAnalysisFromSheets, makeAnswerKey, makeAnswerSheet, makeItemAnalysis, makeItemInfo, type Aoa, type AnswerSheetFixture } from './fixtures/neis.ts'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { parseAnswerKey } from '../src/parsers/answerKey'
import { parseItemAnalysis } from '../src/parsers/itemAnalysis'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { parseItemNo } from '../src/parsers/terms'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'
import { analyze } from '../src/stats/analyze'
import { assignLevel3, cutoffFor } from '../src/stats/levels'
import { DEFAULT_SETTINGS, describeCutoffs, validateCutoffs3, type Settings } from '../src/model/settings'
import { describeCrPart } from '../src/model/format'
import { buildWorkbook } from '../src/export/excel'

const STD = {
  '[9국01-01]': '듣기·말하기는 의미 공유의 과정임을 이해하고 듣기·말하기 활동을 한다.',
  '[9국02-03]': '읽기 목적이나 글의 특성을 고려하여 글을 요약한다.',
  '[9국03-05]': '자신의 삶과 경험을 바탕으로 독자에게 감동이나 즐거움을 주는 글을 쓴다.',
}
const codes = Object.keys(STD)
const N = 9
const KEYS = [1, 2, 3, 4, 5, 1, 2, 3, 4]
const INFO_BASE = {
  nItems: N,
  keys: KEYS,
  points: Array(N).fill(8),
  // 마지막 선다형 문항(9번)은 [9국01-01] 하나만 갖는다. 서답형은 다른 성취기준.
  standards: Array.from({ length: N }, (_, i) => [codes[i % 2]!]),
  standardText: STD,
  domains: Array.from({ length: N }, (_, i) => `단원${(i % 2) + 1}`),
  difficulties: Array.from({ length: N }, () => '보통' as const),
  crItems: [
    { label: '서답1', points: 14, standards: ['[9국03-05]'], domain: '쓰기' },
    { label: '서답2', points: 14, standards: ['[9국03-05]'], domain: '쓰기' },
  ],
}

async function answersFile(fx: AnswerSheetFixture, name: string): Promise<ParsedFile> {
  return { fileName: name, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), name) }
}

describe('문항번호 칸 해석', () => {
  it('숫자와 서답형 이름을 읽고, 하위 문항 표기는 읽지 않는다', () => {
    expect(parseItemNo('3')).toEqual({ no: 3, cr: false })
    expect(parseItemNo(' 12번 ')).toEqual({ no: 12, cr: false })
    expect(parseItemNo('서답1')).toEqual({ no: 1, cr: true })
    expect(parseItemNo('서술형 2')).toEqual({ no: 2, cr: true })
    expect(parseItemNo('[논술형3]')).toEqual({ no: 3, cr: true })
    expect(parseItemNo('서·논술형 4')).toEqual({ no: 4, cr: true })
    expect(parseItemNo('선택형 5')).toEqual({ no: 5, cr: false })
    expect(parseItemNo('1-(2)')).toBeNull()
    expect(parseItemNo('총합계')).toBeNull()
    expect(parseItemNo('')).toBeNull()
  })
})

describe('문항정보표: 서답형 구역 표기 변형', () => {
  const titles = ['서답형 문항', '서술형 문항', '논술형 문항', '서·논술형 문항', '서논술형 문항', '서ㆍ논술형 문항', '서 · 논술형  문항']
  for (const title of titles)
    for (const crNoStyle of ['int', 'label'] as const) {
      it(`"${title}" / 문항번호 ${crNoStyle === 'int' ? '1, 2' : '서답1, 서답2'}`, async () => {
        const p = parseItemInfo(await gridFromAoa(makeItemInfo({ ...INFO_BASE, crSectionTitle: title, crNoStyle })), 'info.xlsx')
        const mc = p.items.filter((i) => i.kind === 'mc')
        const cr = p.items.filter((i) => i.kind === 'cr')
        expect(mc).toHaveLength(N)
        expect(cr.map((i) => [i.label, i.points, i.standards])).toEqual([
          ['서답1', 14, ['[9국03-05]']],
          ['서답2', 14, ['[9국03-05]']],
        ])
        // 핵심: 서답형 행이 마지막 선다형 문항의 성취기준에 섞이지 않는다
        expect(mc[N - 1]!.standards).toEqual(['[9국01-01]'])
        expect(p.warnings.filter((w) => w.code === 'iteminfo-no-key' || w.code === 'iteminfo-row-skipped')).toEqual([])
        expect(p.maxima).toMatchObject({ mc: 72, cr: 28, total: 100 })
      })
    }

  it('구역 제목이 없어도 문항번호가 "서답1"이면 서답형으로 읽는다', async () => {
    const p = parseItemInfo(await gridFromAoa(makeItemInfo({ ...INFO_BASE, crSectionTitle: '', crNoStyle: 'label' })), 'info.xlsx')
    const mc = p.items.filter((i) => i.kind === 'mc')
    expect(mc).toHaveLength(N)
    expect(p.items.filter((i) => i.kind === 'cr')).toHaveLength(2)
    expect(mc[N - 1]!.standards).toEqual(['[9국01-01]'])
  })

  it('읽지 못한 문항 행은 앞 문항에 붙이지 않고 경고한다', async () => {
    const aoa = makeItemInfo({ ...INFO_BASE, crItems: [] })
    const totalIdx = aoa.findIndex((r) => r[0] === '총합계')
    aoa.splice(totalIdx, 0, ['가-1', '쓰기', '[9국03-05] 자신의 삶과 경험을 바탕으로 글을 쓴다.', null, '○', null, 5, null])
    const p = parseItemInfo(await gridFromAoa(aoa), 'info.xlsx')
    expect(p.items).toHaveLength(N)
    expect(p.items[N - 1]!.standards).toEqual(['[9국01-01]'])
    expect(p.warnings.some((w) => w.code === 'iteminfo-row-skipped')).toBe(true)
  })

  it('서답형 총점만 있는 정오표와 합치면 선다형 성취기준만 남고 안내한다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 20, style: '_2', seed: 9, keys: KEYS, points: Array(N).fill(8), crTotalMax: 28, subject: '국어' })
    const info = parseItemInfo(await gridFromAoa(makeItemInfo({ ...INFO_BASE, subject: '국어', crSectionTitle: '서·논술형 문항', crNoStyle: 'label' })), 'info.xlsx')
    const { exam, errors, warnings } = buildExam([await answersFile(fx, 'c1.xlsx'), { fileName: 'info.xlsx', kind: 'itemInfo', itemInfo: info }])
    expect(errors).toEqual([])
    expect(exam!.maxima).toMatchObject({ mc: 72, cr: 28, total: 100 })
    expect(exam!.standards.map((s) => s.code).sort()).toEqual(['[9국01-01]', '[9국02-03]'])
    expect(warnings.some((w) => w.code === 'cr-totals-only')).toBe(true)
    expect(warnings.some((w) => w.code === 'iteminfo-mismatch')).toBe(false)
  })
})

describe('정오표: 서답형 점수 열', () => {
  const spec = { classNo: 1, nItems: 10, nStudents: 18, style: '_2' as const, seed: 21, points: Array(10).fill(6), crTotalMax: 40 }
  for (const header of ['서술형점수', '논술형 점수', '서·논술형점수', '서논술형점수']) {
    it(`"${header}" 열을 서답형 점수로 읽는다`, async () => {
      const fx = makeAnswerSheet({ ...spec, crScoreHeader: header })
      const p = parseAnswerSheet(await gridFromAoa(fx.aoa), 'a.xlsx')
      expect(p.maxima).toMatchObject({ mc: 60, cr: 40, total: 100 })
      expect(p.students.map((s) => s.neis.cr)).toEqual(fx.students.map((s) => s.cr))
      expect(p.warnings.some((w) => w.code === 'cr-column-derived')).toBe(false)
    })
  }

  it('열 이름을 못 알아봐도 총점에서 선택형을 뺀 값으로 서답형을 구하고 알린다', async () => {
    const fx = makeAnswerSheet({ ...spec, crScoreHeader: '영역B' })
    const p = parseAnswerSheet(await gridFromAoa(fx.aoa), 'a.xlsx')
    expect(p.maxima).toMatchObject({ mc: 60, cr: 40, total: 100 })
    expect(p.students.map((s) => s.neis.cr)).toEqual(fx.students.map((s) => s.cr))
    expect(p.warnings.some((w) => w.code === 'cr-column-derived')).toBe(true)
    const { exam } = buildExam([{ fileName: 'a.xlsx', kind: 'answers', answers: p }])
    const r = analyze(exam!, DEFAULT_SETTINGS)
    expect(r.warnings.some((w) => w.code === 'score-mismatch')).toBe(false)
  })

  it('서답형이 없는 시험에서는 서답형을 만들어 내지 않는다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 8, style: '_2', seed: 2, points: Array(10).fill(10), crScoreHeader: '영역B' })
    const p = parseAnswerSheet(await gridFromAoa(fx.aoa), 'a.xlsx')
    expect(p.maxima.cr).toBeNull()
    expect(p.warnings.some((w) => w.code === 'cr-column-derived')).toBe(false)
  })
})

describe('정오표: 문항이 여러 표로 나뉜 양식', () => {
  const base = { classNo: 1, nItems: 12, nStudents: 6, style: '_2' as const, seed: 4 }

  it('문항번호가 다른 머리글 행이 또 있으면 잘못 읽지 않고 멈춘다', async () => {
    const fx = makeAnswerSheet(base)
    const legendIdx = fx.aoa.findIndex((r) => typeof r[0] === 'string' && r[0].startsWith('※'))
    const secondHeader: Aoa[number] = ['반/번호', null, '번호', 13, 14, 15, 16, '선택형점수', '서답형점수', '기타점수', '영역총점']
    const secondRows: Aoa = fx.aoa.slice(6, legendIdx).map((r) => [r[0] ?? null, r[1] ?? null, r[2] ?? null, '.', 2, '.', 3])
    const wide: Aoa = [...fx.aoa.slice(0, legendIdx), secondHeader, ...secondRows, ...fx.aoa.slice(legendIdx)]
    const grid = await gridFromAoa(wide)
    expect(() => parseAnswerSheet(grid, 'wide.xlsx')).toThrow(/여러 표로 나뉜/)
  })

  it('쪽이 넘어가며 같은 머리글이 반복되는 것은 그대로 읽는다', async () => {
    const fx = makeAnswerSheet(base)
    const repeated: Aoa = [...fx.aoa.slice(0, 9), ...fx.aoa.slice(3, 6), ...fx.aoa.slice(9)]
    const p = parseAnswerSheet(await gridFromAoa(repeated), 'two-pages.xlsx')
    expect(p.students).toHaveLength(6)
    expect(p.mcItems).toHaveLength(12)
  })

  it('선다형 문항이 없는 정오표는 지원하지 않는다고 알린다', async () => {
    const aoa: Aoa = [
      [],
      [...Array(8).fill(null), '정기시험교과목별 학생답 정오표'],
      ['2026학년도   1학기   주간 3학년   1반   기말고사   국어'],
      ['반/번호', null, '번호', '선택형점수', '서답형점수', '기타점수', '영역총점'],
      [null, null, '정답'],
      [null, null, '배점', 0, 100, 0, 100],
      ['1/1', 9901000001, '학생01', 0, 80, 0, 80],
    ]
    const grid = await gridFromAoa(aoa)
    expect(() => parseAnswerSheet(grid, 'cr-only.xlsx')).toThrow(/선다형 문항이 없는/)
  })
})

describe('공백이 있는 교과목명', () => {
  const SUBJECT = '생활 일본어'
  const sheets = () => [1, 2].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 15, style: '_2', seed: 60 + c, keys: KEYS, points: Array(N).fill(10), subject: SUBJECT }))

  it('문항분석표와 정답·배점표에서 교과목을 끝까지 읽어 정오표와 같은 과목으로 본다', async () => {
    const sh = sheets()
    const ia = parseItemAnalysis(await gridFromAoa(makeItemAnalysis(itemAnalysisFromSheets(sh, 0, { layout: 'data', subject: SUBJECT })), { bogusRef: true }), 'ia.xlsx')
    const key = parseAnswerKey(await gridFromAoa(makeAnswerKey({ keys: KEYS, points: Array(N).fill(10), subject: SUBJECT, examName: '중간고사' })), 'key.xlsx')
    expect(ia.header.subject).toBe(SUBJECT)
    expect(key.header.subject).toBe(SUBJECT)
    // 문항분석표의 반(1반) 정오표 없이 2반만 올려도(대조 불가) 과목이 같으므로 학년 전체 비교에 쓴다
    const { exam, warnings } = buildExam([await answersFile(sh[1]!, '2반.xlsx'), { fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: ia }, { fileName: 'key.xlsx', kind: 'answerKey', answerKey: key }])
    expect(exam!.header.subject).toBe(SUBJECT)
    expect(exam!.gradeReference).toBeDefined()
    expect(warnings.filter((w) => w.code === 'itemanalysis-header' || w.code === 'answerkey-subject')).toEqual([])
  })
})

describe('문항분석표 대조: 복수정답 문항', () => {
  const make = (multi: boolean) => [1, 2].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 20, style: '_2', seed: 80 + c, keys: KEYS, points: Array(N).fill(10), ...(multi ? { multiKeyItems: { 3: 'B' } } : {}) }))

  it('복수정답 문항만 집계가 달라도 문항분석표를 버리지 않는다', async () => {
    const sh = make(true)
    const ia = parseItemAnalysis(await gridFromAoa(makeItemAnalysis(itemAnalysisFromSheets(sh, 0, { layout: 'data' })), { bogusRef: true }), 'ia.xlsx')
    const { exam, warnings } = buildExam([await answersFile(sh[0]!, '1반.xlsx'), await answersFile(sh[1]!, '2반.xlsx'), { fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: ia }])
    expect(exam!.gradeReference?.verified).toBe(true)
    expect(warnings.find((w) => w.code === 'itemanalysis-verified')!.message).toMatch(/복수정답 문항 3번/)
    expect(warnings.some((w) => w.code === 'itemanalysis-class-mismatch')).toBe(false)
  })

  it('단일정답 문항이 다르면 여전히 쓰지 않는다', async () => {
    const sh = make(false)
    const spec = itemAnalysisFromSheets(sh, 0, { layout: 'data' })
    spec.classCounts[4] = [...spec.classCounts[4]!].reverse()
    const ia = parseItemAnalysis(await gridFromAoa(makeItemAnalysis(spec), { bogusRef: true }), 'ia.xlsx')
    const { exam, warnings } = buildExam([await answersFile(sh[0]!, '1반.xlsx'), await answersFile(sh[1]!, '2반.xlsx'), { fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: ia }])
    expect(exam!.gradeReference).toBeUndefined()
    expect(warnings.some((w) => w.code === 'itemanalysis-class-mismatch')).toBe(true)
  })
})

describe('3단계 성취수준 (체육·음악·미술)', () => {
  const THREE: Settings = { ...DEFAULT_SETTINGS, levelScheme: 'three' }

  it('분할점수 이상이면 해당 수준 (80/60)', () => {
    const c = DEFAULT_SETTINGS.cutoffs3
    expect(assignLevel3(100, c)).toBe('A')
    expect(assignLevel3(80, c)).toBe('A')
    expect(assignLevel3(79.99, c)).toBe('B')
    expect(assignLevel3(60, c)).toBe('B')
    expect(assignLevel3(59.99, c)).toBe('C')
    expect(assignLevel3(0, c)).toBe('C')
    expect(cutoffFor('A', THREE)).toBe(80)
    expect(cutoffFor('B', THREE)).toBe(60)
    expect(cutoffFor('C', THREE)).toBeNull()
    expect(cutoffFor('D', DEFAULT_SETTINGS)).toBe(60)
    expect(describeCutoffs(THREE)).toBe('A 80 / B 60')
    expect(describeCutoffs(DEFAULT_SETTINGS)).toBe('A 90 / B 80 / C 70 / D 60')
    expect(validateCutoffs3({ AB: 60, BC: 80 })).not.toBeNull()
    expect(validateCutoffs3({ AB: 80, BC: 60 })).toBeNull()
  })

  it('A·B·C만 쓰고, 5단계 결과와 총점·평균은 같다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 20, nStudents: 40, style: '_2', seed: 123, points: Array(20).fill(5), subject: '체육' })
    const { exam } = buildExam([await answersFile(fx, 'pe.xlsx')])
    const five = analyze(exam!, DEFAULT_SETTINGS)
    const three = analyze(exam!, THREE)
    expect(three.activeLevels).toEqual(['A', 'B', 'C'])
    expect(five.activeLevels).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(three.byLevel.D.n + three.byLevel.E.n).toBe(0)
    expect(three.byLevel.A.n + three.byLevel.B.n + three.byLevel.C.n).toBe(40)
    expect(three.overview.total.mean).toBeCloseTo(five.overview.total.mean!, 9)
    for (const s of three.students) expect(s.level).toBe(s.pct >= 80 ? 'A' : s.pct >= 60 ? 'B' : 'C')
    expect(three.warnings.find((w) => w.code === 'level-scheme-three')?.level).toBe('info')
    // 체육인데 5단계면 3단계를 제안한다
    expect(five.warnings.some((w) => w.code === 'level-scheme-suggest-three')).toBe(true)
  })

  it('3단계 교과가 아닌데 3단계로 남아 있으면 경고한다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 10, style: '_2', seed: 5, subject: '과학' })
    const { exam } = buildExam([await answersFile(fx, 'sci.xlsx')])
    expect(analyze(exam!, THREE).warnings.find((w) => w.code === 'level-scheme-three')?.level).toBe('warn')
    const five = analyze(exam!, DEFAULT_SETTINGS)
    expect(five.warnings.some((w) => w.code === 'level-scheme-three' || w.code === 'level-scheme-suggest-three')).toBe(false)
  })

  it('엑셀에는 A·B·C 행만 나오고 설정 시트에 3단계가 적힌다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 30, style: '_2', seed: 31, points: Array(10).fill(6), crTotalMax: 40, subject: '미술' })
    const { exam } = buildExam([await answersFile(fx, 'art.xlsx')])
    const result = analyze(exam!, THREE)
    const wb = await buildWorkbook(exam!, result, THREE)
    const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'array' })
    const first = XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets['성취도분석']!, { header: 1 })
    const labels = first.map((r) => r[0])
    expect(labels).toContain('C')
    expect(labels).not.toContain('D')
    expect(labels).not.toContain('E')
    // 서답형이 총점으로만 있어도 서답형이 있음을 적는다
    expect(first.flat().some((v) => typeof v === 'string' && /총점 40점/.test(v))).toBe(true)
    const settingsSheet = XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets['설정']!, { header: 1 })
    expect(settingsSheet.some((r) => r[0] === '성취수준 단계' && /3단계/.test(String(r[1])))).toBe(true)
    expect(settingsSheet.some((r) => r[0] === '분할점수 (% 이상)' && r[1] === 'A 80 / B 60')).toBe(true)
  })
})

describe('서답형 표시 문구', () => {
  it('문항별 열이 없어도 서답형 총점이 있으면 알린다', () => {
    expect(describeCrPart(0, 0)).toBe('선다형')
    expect(describeCrPart(3, 30)).toBe('+ 서답형 3문항')
    expect(describeCrPart(0, 30)).toBe('+ 서답형 (총점 30점)')
    expect(describeCrPart(0, 12.5)).toBe('+ 서답형 (총점 12.5점)')
  })
})
