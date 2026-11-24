/**
 * 2026-11 종합 검토에서 재현한 결함의 회귀 테스트 (계산·파일 읽기·엑셀 내보내기).
 * 모든 데이터는 합성(학생01…)이다.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { gridFromAoa } from './helpers.ts'
import { itemAnalysisFromSheets, makeAnswerSheet, makeItemAnalysis, makeItemInfo, type Aoa } from './fixtures/neis.ts'
import { readWorkbookData } from '../src/xlsx/readWorkbook'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { parseItemAnalysis } from '../src/parsers/itemAnalysis'
import { buildExam, parseGrids, type ParsedFile } from '../src/parsers/index'
import { analyze } from '../src/stats/analyze'
import { DEFAULT_SETTINGS } from '../src/model/settings'
import { alphaBand, discBand, shownValue } from '../src/model/thresholds'
import { fmt1, fmt2, fmt3 } from '../src/model/format'
import { computeFlags } from '../src/stats/flags'
import type { ItemStats } from '../src/model/types'
import { buildWorkbook } from '../src/export/excel'

type Row = (string | number | null)[]

const STD = {
  '[9과17-01]': '물리 변화와 화학 변화의 차이를 알고, 일상생활에서 물리 변화와 화학 변화의 예를 찾을 수 있다.',
  '[9과17-02]': '간단한 화학 반응을 화학 반응식으로 표현하고, 화학 반응식에서 계수의 비를 입자 수의 비로 해석할 수 있다.',
}
const N = 8
const KEYS = Array.from({ length: N }, (_, i) => (i % 5) + 1)
const POINTS = Array.from({ length: N }, () => 4)

function infoAoa(domainPrefix = '영역'): Aoa {
  return makeItemInfo({
    nItems: N,
    keys: KEYS,
    points: POINTS,
    standards: Array.from({ length: N }, (_, i) => [Object.keys(STD)[i % 2]!]),
    standardText: STD,
    domains: Array.from({ length: N }, (_, i) => `${domainPrefix}${(i % 2) + 1}`),
    difficulties: Array.from({ length: N }, () => '보통' as const),
    crItems: [{ label: '서답1', points: 6, standards: ['[9과17-02]'], domain: `${domainPrefix}2` }],
  })
}

/** 선다형 8문항 + 교사가 추가한 "서답1" 열 + 문항정보표 (2개 반) */
async function examWithCrColumn(): Promise<ParsedFile[]> {
  const files: ParsedFile[] = []
  for (const c of [1, 2]) {
    const fx = makeAnswerSheet({ classNo: c, nItems: N, nStudents: 10, style: '_2', seed: 40 + c, keys: KEYS, points: POINTS, crCols: [{ label: '서답1', points: 6 }] })
    files.push({ fileName: `c${c}.xlsx`, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), `c${c}.xlsx`) })
  }
  files.push({ fileName: 'info.xlsx', kind: 'itemInfo', itemInfo: parseItemInfo(await gridFromAoa(infoAoa()), 'info.xlsx') })
  return files
}

async function sheetsOf(files: ParsedFile[]) {
  const { exam, errors } = buildExam(files)
  expect(errors).toEqual([])
  const result = analyze(exam!, DEFAULT_SETTINGS)
  const wb = await buildWorkbook(exam!, result, DEFAULT_SETTINGS)
  const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'array' })
  const rows = (name: string) => XLSX.utils.sheet_to_json<Row>(read.Sheets[name]!, { header: 1 })
  return { exam: exam!, result, read, rows }
}

describe('엑셀 내보내기: 서답형 열을 추가한 시험', () => {
  it('문항별 시트의 선다형 문항에 서답형 문항의 내용영역·성취기준이 들어가지 않는다', async () => {
    const { rows } = await sheetsOf(await examWithCrColumn())
    for (const name of ['문항별분석', '학급별_문항분석']) {
      const all = rows(name)
      const hdr = all.findIndex((r) => r.includes('내용영역'))
      const col = all[hdr]!.indexOf('내용영역')
      const noCol = all[hdr]!.indexOf('문항')
      const first = all[hdr + 2]!
      expect(first[noCol], name).toBe(1)
      // 선다형 1번은 영역1 · [9과17-01]. (서답1 은 영역2 · [9과17-02])
      expect(first[col], name).toBe('영역1')
      expect(first[col + 1], name).toBe('[9과17-01]')
    }
  })

  it('성취기준의 문항 목록에서 서답형은 번호가 아니라 이름("서답1")으로 나온다', async () => {
    const { result, rows } = await sheetsOf(await examWithCrColumn())
    const st = result.standards.find((s) => s.code === '[9과17-02]')!
    expect(st.itemLabels).toEqual(['2', '4', '6', '8', '서답1'])
    const all = rows('성취기준별')
    const hdr = all.findIndex((r) => r[0] === '성취기준')
    const row = all.find((r) => r[0] === '[9과17-02]')!
    expect(row[all[hdr]!.indexOf('문항')]).toBe('2, 4, 6, 8, 서답1')
  })

  it('자동 필터의 머리글이 2단 머리글의 아래 행이다 (첫 자료 행이 머리글이 되지 않는다)', async () => {
    const { read, rows } = await sheetsOf(await examWithCrColumn())
    for (const [name, firstHeader] of [
      ['학급별_문항분석', '학급'],
      ['문항별_성취수준별', '성취수준'],
    ] as const) {
      const hdr = rows(name).findIndex((r) => r[0] === firstHeader)
      const ref = (read.Sheets[name]!['!autofilter'] as { ref: string }).ref
      // 머리글은 hdr(묶음 제목)·hdr+1(열 제목) 두 행, 자료는 hdr+2 부터
      expect(XLSX.utils.decode_range(ref).s.r, name).toBe(hdr + 1)
    }
  })
})

describe('정오표의 수식 오류 칸(#N/A 등)', () => {
  it('오류 코드 숫자를 점수로 읽지 않고, 빈 칸으로 보고 알린다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 6, style: '_2', seed: 7, keys: KEYS, points: POINTS, crCols: [{ label: '서답1', points: 6 }] })
    const ws = XLSX.utils.aoa_to_sheet(fx.aoa as Row[])
    const hdrRow = fx.aoa.findIndex((r) => r.includes('서답1'))
    const crCol = fx.aoa[hdrRow]!.indexOf('서답1')
    const totalCol = fx.aoa[hdrRow]!.indexOf('영역총점')
    const firstStudent = hdrRow + 3
    // 첫 학생의 서답1 = #N/A, 둘째 학생의 영역총점 = #VALUE!
    ws[XLSX.utils.encode_cell({ r: firstStudent, c: crCol })] = { t: 'e', v: 0x2a, w: '#N/A' }
    ws[XLSX.utils.encode_cell({ r: firstStudent + 1, c: totalCol })] = { t: 'e', v: 0x0f, w: '#VALUE!' }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'sheet1')
    const grids = await readWorkbookData(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'c1.xlsx')
    const g = grids[0]!
    expect(g.num(firstStudent + 1, crCol + 1)).toBeNull()
    expect(g.text(firstStudent + 1, crCol + 1)).toBe('')

    const parsed = parseGrids(grids, 'c1.xlsx')
    expect(parsed.error).toBeUndefined()
    const students = parsed.answers!.students
    expect(students[0]!.crScores).toEqual([0]) // 42점이 아니다
    expect(students[1]!.neis.total).toBe(fx.students[1]!.total) // 15점이 아니라 응답으로 다시 계산
    const w = parsed.answers!.warnings.find((x) => x.code === 'error-cells')
    expect(w?.message).toContain('2개')
  })
})

describe('문항정보표를 고쳐서 다시 올렸을 때', () => {
  it('나중에 올린 문항정보표를 쓰고, 두 개가 올라와 있음을 알린다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 10, style: '_2', seed: 41, keys: KEYS, points: POINTS })
    const files: ParsedFile[] = [
      { fileName: 'c1.xlsx', kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), 'c1.xlsx') },
      { fileName: '문항정보표.xlsx', kind: 'itemInfo', itemInfo: parseItemInfo(await gridFromAoa(infoAoa('옛영역')), '문항정보표.xlsx') },
      { fileName: '문항정보표.xlsx', kind: 'itemInfo', itemInfo: parseItemInfo(await gridFromAoa(infoAoa('새영역')), '문항정보표.xlsx') },
    ]
    const { exam, warnings } = buildExam(files)
    expect(exam!.items[0]!.domain).toBe('새영역1')
    expect(warnings.some((w) => w.code === 'multiple-item-info')).toBe(true)
  })
})

describe('다른 학년의 문항분석표', () => {
  it('같은 반 정오표가 없어 대조할 수 없는데 학년까지 다르면 학년 전체 비교에 쓰지 않는다', async () => {
    // 정오표는 2학년 1·2반, 문항분석표는 3학년 3반(픽스처 제목이 3학년)
    const sh = [1, 2, 3].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 12, style: '_2', seed: 600 + c, keys: KEYS, points: POINTS, grade: '2' }))
    const ia = parseItemAnalysis(await gridFromAoa(makeItemAnalysis(itemAnalysisFromSheets(sh, 2, { layout: 'data' }))), 'ia.xlsx')
    expect(ia.header.grade).toBe('3')
    const files: ParsedFile[] = [
      { fileName: 'c1.xlsx', kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(sh[0]!.aoa), 'c1.xlsx') },
      { fileName: 'c2.xlsx', kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(sh[1]!.aoa), 'c2.xlsx') },
      { fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: ia },
    ]
    const { exam, warnings } = buildExam(files)
    expect(exam!.header.grade).toBe('2')
    expect(exam!.gradeReference).toBeUndefined()
    // "학년 전체 비교"라는 말은 늘 들어 있으므로, 달라진 항목으로 학년을 짚었는지를 본다
    expect(warnings.find((w) => w.code === 'itemanalysis-header')?.message).toContain('의 학년이(가) 정오표와 달라')
  })
})

describe('정답 칸을 읽지 못한 문항', () => {
  it('실제로는 채점에 들어가므로 "채점에서 제외"라고 안내하지 않는다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: N, nStudents: 6, style: '_2', seed: 9, keys: KEYS, points: POINTS, overrides: { '0:3': '.' } })
    const keyRow = fx.aoa.findIndex((r) => r.includes('정답'))
    fx.aoa[keyRow]![3 + 2] = '?' // 3번 문항의 정답 칸
    const parsed = parseAnswerSheet(await gridFromAoa(fx.aoa), 'c1.xlsx')
    const { exam } = buildExam([{ fileName: 'c1.xlsx', kind: 'answers', answers: parsed }])
    const r = analyze(exam!, { ...DEFAULT_SETTINGS, scoreSource: 'recomputed' })
    // 첫 학생은 3번을 맞혔고(.), 그 배점이 점수에 들어 있다
    const first = r.students[0]!
    expect(first.wrongItems.some((w) => w.no === 3)).toBe(false)
    expect(first.mcScore).toBe(fx.students[0]!.mc)
    const w = parsed.warnings.find((x) => x.code === 'item-no-key')!
    expect(w.message).not.toContain('제외')
  })
})

describe('한 파일에 시트가 여러 개일 때', () => {
  function workbook(sheets: [string, Aoa][]): ArrayBuffer {
    const wb = XLSX.utils.book_new()
    for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa as Row[]), name)
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }
  const sheet = (c: number) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 6, style: '_2', seed: 20 + c, keys: KEYS, points: POINTS }).aoa

  it('읽지 않은 시트가 있으면 어느 시트인지와 어떻게 올려야 하는지 알린다', async () => {
    const grids = await readWorkbookData(workbook([['1반', sheet(1)], ['2반', sheet(2)], ['3반', sheet(3)]]), '정오표모음.xlsx')
    const parsed = parseGrids(grids, '정오표모음.xlsx')
    expect(parsed.answers!.classNos).toEqual(['1'])
    const w = parsed.answers!.warnings.find((x) => x.code === 'other-sheets-ignored')!
    expect(w.level).toBe('warn')
    expect(w.message).toContain('"1반" 시트만 읽었')
    expect(w.message).toContain('"2반", "3반"')
    expect(w.message).toContain('따로 파일로 저장')
  })

  it('빈 시트나 관계없는 시트만 더 있을 때는 알리지 않는다', async () => {
    const grids = await readWorkbookData(workbook([['Sheet1', sheet(1)], ['Sheet2', [[]]], ['메모', [['참고'], ['수업 시간표']]]]), 'c1.xlsx')
    const parsed = parseGrids(grids, 'c1.xlsx')
    expect(parsed.error).toBeUndefined()
    expect(parsed.answers!.warnings.some((x) => x.code === 'other-sheets-ignored')).toBe(false)
  })
})

describe('학급 필터를 건 채 엑셀로 내보낼 때', () => {
  it('문항분석표_재구성 시트에도 고른 반만 나온다', async () => {
    const { exam } = buildExam(await examWithCrColumn())
    const result = analyze(exam!, DEFAULT_SETTINGS, { classFilter: ['2'] })
    const wb = await buildWorkbook(exam!, result, DEFAULT_SETTINGS)
    const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'array' })
    const captions = XLSX.utils
      .sheet_to_json<Row>(read.Sheets['문항분석표_재구성']!, { header: 1 })
      .map((r) => r[0])
      .filter((v): v is string => typeof v === 'string' && /^\d+반 \(\d+명\)$/.test(v))
    expect(captions.map((c) => c.split(' ')[0])).toEqual(['2반'])
  })
})

describe('판정은 화면에 보이는 값으로 한다', () => {
  const item = (disc: number): Omit<ItemStats, 'flags'> => ({ no: 1, key: [1], points: 4, n: 100, p: 60, disc, counts: { 1: 60, 2: 10, 3: 10, 4: 10, 5: 10, none: 0 }, pct: { 1: 60, 2: 10, 3: 10, 4: 10, 5: 10, none: 0 }, blank: 0, multi: 0, invalid: 0, observed3: '보통', observed5: '쉬움' })
  const codes = (disc: number) => computeFlags(item(disc)).map((f) => f.code)

  it('변별도: 0.20으로 보이는 0.1996은 ".20 미만"이 아니다', () => {
    expect(discBand(0.1996)?.label).toBe('낮음') // 0.20 → .20 이상 .30 미만
    expect(discBand(0.1949)?.label).toBe('매우 낮음') // 0.19
    expect(discBand(0.3951)?.label).toBe('높음') // 0.40
    expect(discBand(0.0951)?.label).toBe('매우 낮음') // 0.10
    expect(codes(0.1996)).not.toContain('low-disc')
    expect(codes(0.1949)).toContain('low-disc')
    // -0.00 으로 보이는 값은 음수로 치지 않는다
    expect(codes(-0.004)).toEqual(expect.arrayContaining(['low-disc']))
    expect(codes(-0.004)).not.toContain('neg-disc')
    expect(codes(-0.006)).toContain('neg-disc')
  })

  it('신뢰도: 0.700으로 보이는 0.69996은 "수용 가능"이다', () => {
    expect(alphaBand(0.69996)?.label).toBe('수용 가능')
    expect(alphaBand(0.6994)?.label).toBe('의심스러움') // 0.699
    expect(alphaBand(0.89951)?.label).toBe('매우 높음') // 0.900
  })

  it('판정에 쓰는 값은 화면에 찍히는 값과 정확히 같다 (0.295 는 "0.30"으로 보이므로 .30)', () => {
    for (const v of [0.295, 0.195, 0.095, 0.395, 0.1996, 0.2949999, 0.005, 0.015, 0.4995, 0.7995, 0.8995, -0.004, -0.295]) {
      expect(shownValue(v, 2), `${v} 둘째 자리`).toBe(Number(fmt2(v)))
      expect(shownValue(v, 3), `${v} 셋째 자리`).toBe(Number(fmt3(v)))
    }
    expect(fmt2(0.295)).toBe('0.30')
    expect(discBand(0.295)?.label).toBe('있음')
    expect(fmt3(0.7995)).toBe('0.800')
    expect(alphaBand(0.7995)?.label).toBe('높음')
  })

  it('0으로 보이는 아주 작은 음수는 "-0.00"이 아니라 "0.00"으로 적는다', () => {
    expect(fmt2(-1.9e-17)).toBe('0.00') // 계산 오차로 생기는 값
    expect(fmt2(-0.004)).toBe('0.00')
    expect(fmt2(-0.006)).toBe('-0.01')
    expect(fmt3(-0.0004)).toBe('0.000')
    expect(fmt1(-0.04)).toBe('0.0')
    expect(fmt1(-0.06)).toBe('-0.1')
    expect(fmt2(0.004)).toBe('0.00')
    expect(fmt2(null)).toBe('-')
  })

  it('경계에서 떨어진 값의 판정은 그대로다', () => {
    expect([0.05, 0.15, 0.25, 0.35, 0.45, -0.3].map((d) => discBand(d)?.label)).toEqual(['변별력 없음', '매우 낮음', '낮음', '있음', '높음', '변별력 없음'])
    expect([0.45, 0.55, 0.65, 0.75, 0.85, 0.95].map((a) => alphaBand(a)?.label)).toEqual(['수용 불가', '낮음', '의심스러움', '수용 가능', '높음', '매우 높음'])
    expect(discBand(null)).toBeNull()
    expect(alphaBand(null)).toBeNull()
  })
})

describe('최고점·최저점', () => {
  it('분석에 포함된 학생의 총점 중 가장 높은 값과 낮은 값을 전체·학급별로 구한다', async () => {
    // 1반 첫 학생은 결시(분석에서 빠짐) — 최저점에 0점으로 섞이면 안 된다
    const fx = [1, 2].map((c) => makeAnswerSheet({ classNo: c, nItems: N, nStudents: 9, style: '_2', seed: 70 + c, keys: KEYS, points: POINTS, absent: c === 1 ? [0] : [] }))
    const files: ParsedFile[] = []
    for (const [i, f] of fx.entries()) files.push({ fileName: `c${i + 1}.xlsx`, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(f.aoa), `c${i + 1}.xlsx`) })
    const { exam } = buildExam(files)
    const r = analyze(exam!, DEFAULT_SETTINGS)
    const totals = (f: (typeof fx)[number], skip: number[] = []) => f.students.filter((_, i) => !skip.includes(i)).map((s) => s.total)
    const all = [...totals(fx[0]!, [0]), ...totals(fx[1]!)]
    expect(r.overview.totalMax).toBe(Math.max(...all))
    expect(r.overview.totalMin).toBe(Math.min(...all))
    expect(r.overview.totalMin).toBeGreaterThan(0)
    expect(r.byClass['2']!.totalMax).toBe(Math.max(...totals(fx[1]!)))
    expect(r.byClass['2']!.totalMin).toBe(Math.min(...totals(fx[1]!)))
    // 학생이 없는 집단은 값이 없다
    const none = analyze(exam!, DEFAULT_SETTINGS, { classFilter: ['9'] })
    expect(none.overview.n).toBe(0)
    expect(none.overview.totalMax).toBeNull()
    expect(none.overview.totalMin).toBeNull()
  })

  it('엑셀의 성취도분석 시트에도 최고점·최저점이 들어간다 (학급 필터를 걸면 고른 반의 값)', async () => {
    const { exam } = buildExam(await examWithCrColumn())
    for (const classFilter of [undefined, ['2']]) {
      const result = analyze(exam!, DEFAULT_SETTINGS, { classFilter })
      const wb = await buildWorkbook(exam!, result, DEFAULT_SETTINGS)
      const read = XLSX.read(await wb.xlsx.writeBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<Row>(read.Sheets['성취도분석']!, { header: 1 })
      const hdr = rows.findIndex((r) => r.includes('응답자 수'))
      const cell = (name: string) => rows[hdr + 1]![rows[hdr]!.indexOf(name)]
      expect(cell('응답자 수')).toBe(result.overview.n)
      expect(cell('최고점')).toBe(result.overview.totalMax)
      expect(cell('최저점')).toBe(result.overview.totalMin)
      expect(typeof cell('최고점')).toBe('number')
    }
  })
})
