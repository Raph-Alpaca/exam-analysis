import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { gridFromAoa } from './helpers.ts'
import { makeAnswerSheet, makeItemInfo } from './fixtures/neis.ts'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'
import { analyze } from '../src/stats/analyze'
import { DEFAULT_SETTINGS } from '../src/model/settings'
import { buildWorkbook, exportFileName } from '../src/export/excel'

const STD = {
  '[9과17-01]': '물리 변화와 화학 변화의 차이를 알고, 일상생활에서 물리 변화와 화학 변화의 예를 찾을 수 있다.',
  '[9과17-02]': '간단한 화학 반응을 화학 반응식으로 표현하고, 화학 반응식에서 계수의 비를 입자 수의 비로 해석할 수 있다.',
}

describe('엑셀 내보내기', () => {
  it('시트 구성과 주요 값이 분석 결과와 일치한다', async () => {
    const n = 8
    const keys = Array.from({ length: n }, (_, i) => (i % 5) + 1)
    const points = Array.from({ length: n }, () => 4)
    const files: ParsedFile[] = []
    for (const c of [1, 2]) {
      const fx = makeAnswerSheet({ classNo: c, nItems: n, nStudents: 10, style: '_2', seed: 40 + c, keys, points, crCols: [{ label: '서답1', points: 6 }] })
      files.push({ fileName: `c${c}.xlsx`, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), `c${c}.xlsx`) })
    }
    const info = makeItemInfo({
      nItems: n,
      keys,
      points,
      standards: Array.from({ length: n }, (_, i) => [Object.keys(STD)[i % 2]!]),
      standardText: STD,
      domains: Array.from({ length: n }, (_, i) => `영역${(i % 2) + 1}`),
      difficulties: Array.from({ length: n }, () => '보통' as const),
      crItems: [{ label: '서답1', points: 6, standards: ['[9과17-02]'], domain: '영역2' }],
    })
    files.push({ fileName: 'info.xlsx', kind: 'itemInfo', itemInfo: parseItemInfo(await gridFromAoa(info), 'info.xlsx') })
    const { exam, errors } = buildExam(files)
    expect(errors).toEqual([])
    const result = analyze(exam!, DEFAULT_SETTINGS)
    expect(result.constructed).toHaveLength(1)

    const wb = await buildWorkbook(exam!, result, DEFAULT_SETTINGS)
    const buf = await wb.xlsx.writeBuffer()
    const read = XLSX.read(buf, { type: 'array' })
    expect(read.SheetNames).toEqual(['성취도분석', '문항별분석', '문항별_성취수준별', '성취수준별_상하위', '학급별_문항분석', '문항분석표_재구성', '평가영역별', '성취기준별', '서답형', '학생별', '설정'])

    // 문항별분석: 헤더 2단 + 데이터 n행, 정답률 값 일치
    const items = XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets['문항별분석']!, { header: 1 })
    const hdrRow = items.findIndex((r) => r[0] === '문항')
    expect(hdrRow).toBeGreaterThan(0)
    const first = items[hdrRow + 2]!
    expect(first[0]).toBe(1)
    expect(first[6]).toBeCloseTo(result.items[0]!.p!, 6)

    // 학생별: 학생 수만큼의 행
    const students = XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets['학생별']!, { header: 1 })
    const sHdr = students.findIndex((r) => r[0] === '반')
    expect(students.length - sHdr - 2).toBe(result.students.length)

    // 문항분석표_재구성: "n(m)" 셀
    const neis = XLSX.utils.sheet_to_json<(string | number)[]>(read.Sheets['문항분석표_재구성']!, { header: 1 })
    expect(neis.some((r) => typeof r[1] === 'string' && /^\d+\(\d+\)$/.test(r[1]))).toBe(true)

    expect(exportFileName(exam!)).toBe('성취평가분석_2026학년도_3학년_1학기_중간고사_과학.xlsx')
  })
})
