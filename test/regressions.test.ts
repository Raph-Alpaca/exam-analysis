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
