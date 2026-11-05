/**
 * 다른 교과·학교 파일에서 나올 수 있는 변형과, 문항분석표 대조·결시생 처리 검증.
 * 모든 데이터는 합성(학생01…)이다.
 */
import { describe, expect, it } from 'vitest'
import { gridFromAoa } from './helpers.ts'
import { itemAnalysisFromSheets, makeAnswerSheet, makeItemAnalysis, makeItemInfo, type AnswerSheetFixture } from './fixtures/neis.ts'
import { detectKind } from '../src/parsers/detect'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { parseItemAnalysis } from '../src/parsers/itemAnalysis'
import { parseItemInfo } from '../src/parsers/itemInfo'
import { buildExam, type ParsedFile } from '../src/parsers/buildExam'
import { decodeResponse } from '../src/parsers/legend'
import { analyze } from '../src/stats/analyze'
import { buildNeisTable } from '../src/stats/neisTable'
import { DEFAULT_SETTINGS } from '../src/model/settings'
import { readWorkbookData, sniffFormat } from '../src/xlsx/readWorkbook'

const N_ITEMS = 12
const KEYS = [3, 1, 4, 2, 5, 3, 1, 2, 4, 5, 2, 3]
const POINTS = [8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9]

function sheets(opts: { absent?: number[]; recognized?: number[] } = {}): AnswerSheetFixture[] {
  return [1, 2, 3].map((c) =>
    makeAnswerSheet({
      classNo: c,
      nItems: N_ITEMS,
      nStudents: 20,
      style: '_2',
      seed: 500 + c,
      keys: KEYS,
      points: POINTS,
      // 무표기·복수표기가 꼭 섞이도록
      overrides: { '0:2': '-', '1:3': 'I', '2:3': 'I', '3:5': '-', '4:12': 'O' },
      ...(c === 1 ? opts : {}),
    }),
  )
}

async function answersFile(fx: AnswerSheetFixture, name: string): Promise<ParsedFile> {
  return { fileName: name, kind: 'answers', answers: parseAnswerSheet(await gridFromAoa(fx.aoa), name) }
}

describe('문항분석표: NEIS 두 가지 저장 형식', () => {
  for (const layout of ['data', 'report'] as const) {
    it(`${layout}: 무표기·중복표기를 따로 읽고, 빈 칸은 위 값으로 채우고, 반 번호를 읽는다`, async () => {
      const sh = sheets()
      const spec = itemAnalysisFromSheets(sh, 1, { layout, rowsPerPage: 7 })
      const grid = await gridFromAoa(makeItemAnalysis(spec), { bogusRef: layout === 'data' })
      expect(detectKind(grid)).toBe('itemAnalysis')
      const p = parseItemAnalysis(grid, 'ia.xlsx')
      expect(p.classNo).toBe('2')
      expect(p.items).toHaveLength(N_ITEMS)
      expect(p.classN).toBe(20)
      expect(p.gradeN).toBe(60)
      p.items.forEach((it, i) => {
        expect(it.no).toBe(i + 1)
        expect(it.key).toBe(KEYS[i])
        expect([1, 2, 3, 4, 5].map((k) => it.classCounts[k as 1])).toEqual(spec.classCounts[i])
        expect([1, 2, 3, 4, 5].map((k) => it.gradeCounts[k as 1])).toEqual(spec.gradeCounts[i])
        expect(it.classBlank).toBe(spec.classBlank![i])
        expect(it.classMulti).toBe(spec.classMulti![i])
        expect(it.gradeBlank).toBe(spec.gradeBlank![i])
        expect(it.gradeMulti).toBe(spec.gradeMulti![i])
      })
      // 테스트 데이터에 실제로 0이 아닌 무표기·중복표기가 있는지 (빈 칸 채우기를 제대로 시험하는지)
      expect(spec.gradeMulti!.some((v) => v > 0)).toBe(true)
      expect(spec.gradeBlank!.some((v) => v > 0)).toBe(true)
    })
  }
})

describe('문항분석표를 같은 반 정오표와 대조', () => {
  async function build(iaOpts: Parameters<typeof itemAnalysisFromSheets>[2], classIdx = 0, upload = [0, 1, 2], tamper?: (s: ReturnType<typeof itemAnalysisFromSheets>) => void) {
    const sh = sheets()
    const spec = itemAnalysisFromSheets(sh, classIdx, { layout: 'data', ...iaOpts })
    tamper?.(spec)
    const files: ParsedFile[] = []
    for (const i of upload) files.push(await answersFile(sh[i]!, `c${i + 1}.xlsx`))
    const ia = parseItemAnalysis(await gridFromAoa(makeItemAnalysis(spec)), 'ia.xlsx')
    files.push({ fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: ia })
    return { ...buildExam(files), spec }
  }

  it('일치하면 학년 전체 수치로 쓰고, 재구성 표가 문항분석표와 칸까지 같다', async () => {
    const { exam, warnings, spec } = await build({})
    expect(exam!.gradeReference?.verified).toBe(true)
    expect(exam!.gradeReference?.classNo).toBe('1')
    expect(warnings.some((w) => w.code === 'itemanalysis-verified')).toBe(true)
    const t = buildNeisTable(exam!, '1', DEFAULT_SETTINGS)!
    expect(t.usesReference).toBe(true)
    t.rows.forEach((r, i) => {
      expect(r.cells).toEqual(spec.classCounts[i]!.map((c, j) => `${c}(${spec.gradeCounts[i]![j]})`))
      expect(r.blank).toBe(`${spec.classBlank![i]}(${spec.gradeBlank![i]})`)
      expect(r.multi).toBe(`${spec.classMulti![i]}(${spec.gradeMulti![i]})`)
      expect(r.sum).toBe(spec.classN)
    })
  })

  it('반 수치가 다르면(다른 시험) 쓰지 않고 경고한다', async () => {
    const { exam, warnings } = await build({}, 0, [0, 1, 2], (s) => {
      s.classCounts[3]![0]! += 1
      s.classCounts[3]![1]! -= 1
    })
    expect(exam!.gradeReference).toBeUndefined()
    const w = warnings.find((x) => x.code === 'itemanalysis-class-mismatch')
    expect(w).toBeTruthy()
    expect(w!.details!.join(' ')).toContain('4번')
  })

  it('그 반 정오표가 없으면 대조 없이 쓰되 안내한다', async () => {
    const { exam, warnings } = await build({}, 2, [0, 1])
    expect(exam!.gradeReference?.classNo).toBe('3')
    expect(exam!.gradeReference?.verified).toBeUndefined()
    expect(warnings.some((w) => w.code === 'itemanalysis-unverified')).toBe(true)
  })

  it('대조할 수 없고 교과목도 다르면 쓰지 않는다', async () => {
    const { exam, warnings } = await build({ subject: '수학' }, 2, [0, 1])
    expect(exam!.gradeReference).toBeUndefined()
    expect(warnings.some((w) => w.code === 'itemanalysis-header')).toBe(true)
  })
})

describe('결시·미응시 학생', () => {
  it('응답이 하나도 없는 학생은 기본으로 빼고, 설정으로 포함할 수 있다', async () => {
    const sh = sheets({ absent: [4], recognized: [7] })
    const files = [await answersFile(sh[0]!, 'c1.xlsx'), await answersFile(sh[1]!, 'c2.xlsx')]
    const { exam, errors } = buildExam(files)
    expect(errors).toEqual([])
    expect(exam!.classes[0]!.students).toHaveLength(20)
    const r = analyze(exam!, DEFAULT_SETTINGS)
    expect(r.overview.n).toBe(38)
    const w = r.warnings.find((x) => x.code === 'no-response-excluded')!
    expect(w.message).toContain('2명')
    expect(w.message).toContain('결시 인정점')
    expect(w.details!.join(' ')).toContain('1반 5번')
    expect(w.details!.join(' ')).toContain('1반 8번')
    // 점수만 있는 학생 때문에 "점수 불일치" 경고가 나오지 않아야 한다
    expect(r.warnings.some((x) => x.code === 'score-mismatch')).toBe(false)
    const incl = analyze(exam!, { ...DEFAULT_SETTINGS, excludeNoResponse: false })
    expect(incl.overview.n).toBe(40)
    expect(incl.warnings.some((x) => x.code === 'no-response-included')).toBe(true)
  })

  it('결시생이 있어도 문항분석표 대조가 맞는다 (NEIS가 결시생을 빼는 경우)', async () => {
    const sh = sheets({ absent: [4] })
    const spec = itemAnalysisFromSheets(sh, 0, { layout: 'data' })
    const files = [await answersFile(sh[0]!, 'c1.xlsx'), await answersFile(sh[1]!, 'c2.xlsx'), await answersFile(sh[2]!, 'c3.xlsx')]
    files.push({ fileName: 'ia.xlsx', kind: 'itemAnalysis', itemAnalysis: parseItemAnalysis(await gridFromAoa(makeItemAnalysis(spec)), 'ia.xlsx') })
    const { exam } = buildExam(files)
    expect(exam!.gradeReference?.verified).toBe(true)
    const t = buildNeisTable(exam!, '1', DEFAULT_SETTINGS)!
    expect(t.n).toBe(19)
  })

  it('반 전체가 결시여도 분석이 멈추지 않는다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 5, nStudents: 3, style: '_2', seed: 1, absent: [0, 1, 2] })
    const { exam } = buildExam([await answersFile(fx, 'c1.xlsx')])
    const r = analyze(exam!, DEFAULT_SETTINGS)
    expect(r.overview.n).toBe(0)
    expect(r.warnings.some((w) => w.code === 'no-students')).toBe(true)
    expect(r.items[0]!.p).toBeNull()
  })
})

describe('학교·버전별 정오표 변형', () => {
  it('"N 강의실" 제목, 학번이 먼저 오는 열 순서, "1-3" 반/번호, 원문자 정답, 4지선다', async () => {
    const fx = makeAnswerSheet({ classNo: 7, nItems: 10, nStudents: 12, style: '_1', seed: 9, classLabel: '강의실', idFirst: true, seatSep: '-', circledKeys: true, nChoices: 4, examName: '1학기 중간고사(지필)', subject: '과학:통합과학(3)' })
    const grid = await gridFromAoa(fx.aoa, { bogusRef: true })
    expect(detectKind(grid)).toBe('answers')
    const p = parseAnswerSheet(grid, 'v.xlsx')
    expect(p.header).toMatchObject({ classNo: '7', examName: '1학기 중간고사(지필)', subject: '과학:통합과학(3)' })
    expect(p.classNos).toEqual(['7'])
    expect(p.mcItems.map((i) => i.key?.key[0])).toEqual(fx.keys)
    expect(Math.max(...fx.keys)).toBeLessThanOrEqual(4)
    expect(p.students[2]!.id).toBe('7/3')
    expect(p.students[2]!.studentId).toBe(fx.students[2]!.studentId)
    expect(p.students[2]!.name).toBe('학생03')
    expect(p.students.map((s) => s.neis.total)).toEqual(fx.students.map((s) => s.total))
  })

  it('복수표기 코드 O(1,3,5)를 정답으로 착각하지 않는다', () => {
    expect(decodeResponse('O')).toEqual({ k: 'multi', choices: [1, 3, 5] })
    expect(decodeResponse('.')).toEqual({ k: 'correct' })
    expect(decodeResponse('③')).toEqual({ k: 'wrong', choice: 3 })
  })

  it('NEIS 서답형 총점만 있는 과목: 총점으로 성취수준을 내고 서답형 평균을 구한다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 15, nStudents: 25, style: '_2', seed: 77, crTotalMax: 40, points: Array(15).fill(4) })
    const { exam } = buildExam([await answersFile(fx, 'c1.xlsx')])
    expect(exam!.maxima).toMatchObject({ mc: 60, cr: 40, total: 100 })
    const r = analyze(exam!, DEFAULT_SETTINGS)
    expect(r.overview.cr.mean).toBeCloseTo(fx.students.reduce((a, s) => a + s.cr, 0) / 25, 6)
    expect(r.overview.total.mean).toBeCloseTo(fx.students.reduce((a, s) => a + s.total, 0) / 25, 6)
    expect(r.constructed).toEqual([])
    const mcBasis = analyze(exam!, { ...DEFAULT_SETTINGS, levelBasis: 'mcMax' })
    expect(mcBasis.students[0]!.pct).toBeCloseTo((100 * fx.students[0]!.mc) / 60, 6)
  })

  it('같은 반이 두 파일에 나뉘어 있으면 합치고, 같은 파일을 두 번 올리면 한 번만 센다', async () => {
    const a = makeAnswerSheet({ classNo: 2, nItems: 8, nStudents: 20, style: '_2', seed: 3 })
    const first = { ...a, aoa: [...a.aoa.slice(0, 6), ...a.aoa.slice(6, 16), ...a.aoa.slice(26)] }
    const second = { ...a, aoa: [...a.aoa.slice(0, 6), ...a.aoa.slice(16, 26), ...a.aoa.slice(26)] }
    const split = buildExam([await answersFile(first, 'A강의실.xlsx'), await answersFile(second, 'B강의실.xlsx')])
    expect(split.exam!.classes).toHaveLength(1)
    expect(split.exam!.classes[0]!.students).toHaveLength(20)
    expect(split.warnings.some((w) => w.code === 'class-split-files')).toBe(true)
    const dup = buildExam([await answersFile(a, '2반.xlsx'), await answersFile(a, '2반 (1).xlsx')])
    expect(dup.exam!.classes[0]!.students).toHaveLength(20)
    expect(dup.warnings.some((w) => w.code === 'duplicate-students')).toBe(true)
  })

  it('제목 표기만 다르고 정답·배점이 같으면 같은 시험으로 합치고, 정답이 다르면 막는다', async () => {
    const base = { nItems: 8, nStudents: 10, style: '_2' as const, keys: [1, 2, 3, 4, 5, 1, 2, 3], points: Array(8).fill(5) }
    const a = makeAnswerSheet({ ...base, classNo: 1, seed: 1, examName: '2학기 기말고사' })
    const b = makeAnswerSheet({ ...base, classNo: 2, seed: 2, examName: '2학기  기말 고사' })
    const ok = buildExam([await answersFile(a, 'a.xlsx'), await answersFile(b, 'b.xlsx')])
    expect(ok.errors).toEqual([])
    expect(ok.exam!.classes).toHaveLength(2)
    const c = makeAnswerSheet({ ...base, classNo: 2, seed: 2, examName: '1학기 중간고사', keys: [5, 4, 3, 2, 1, 5, 4, 3] })
    const bad = buildExam([await answersFile(a, 'a.xlsx'), await answersFile(c, 'c.xlsx')])
    expect(bad.exam).toBeNull()
    expect(bad.errors[0]!.code).toBe('mixed-exams')
  })
})

describe('문항정보표 변형 (다른 교과)', () => {
  const STD = {
    '[9사(지리)01-01]': '지도의 기본 요소를 이해하고, 지리 정보를 수집하여 지도로 표현할 수 있다.',
    '[9사(일사)02-01]': '민주주의의 의미와 기본 원리를 이해한다.',
    '[9국02-03]': '읽기 목적이나 글의 특성을 고려하여 글을 요약한다.',
  }
  const codes = Object.keys(STD)
  const base = {
    nItems: 9,
    keys: [1, 2, 3, 4, 5, 1, 2, 3, 4],
    points: Array(9).fill(8),
    standards: Array.from({ length: 9 }, (_, i) => [codes[i % 3]!]),
    standardText: STD,
    domains: Array.from({ length: 9 }, (_, i) => `단원${(i % 3) + 1}`),
    difficulties: Array.from({ length: 9 }, (_, i) => (['어려움', '보통', '쉬움'] as const)[i % 3]!),
    crItems: [{ label: '서답1', points: 28, standards: ['[9국02-03]'], domain: '단원3' }],
  }
  for (const [name, extra] of [
    ['○ 표시 3열', {}],
    ['상·중·하 3열', { difficultyStyle: 'sangjungha' as const }],
    ['난이도를 글자로 적은 열', { difficultyStyle: 'text' as const }],
    ['서답형 구역이 총합계 뒤', { crAfterTotal: true }],
    ['예전 제목 "이원목적분류표"', { title: '이 원 목 적 분 류 표' }],
  ] as const) {
    it(name, async () => {
      const grid = await gridFromAoa(makeItemInfo({ ...base, ...extra }))
      expect(detectKind(grid)).toBe('itemInfo')
      const p = parseItemInfo(grid, 'info.xlsx')
      const mc = p.items.filter((i) => i.kind === 'mc')
      const cr = p.items.filter((i) => i.kind === 'cr')
      expect(mc).toHaveLength(9)
      expect(cr).toHaveLength(1)
      expect(cr[0]).toMatchObject({ points: 28, standards: ['[9국02-03]'] })
      expect(mc.map((i) => i.difficulty)).toEqual(base.difficulties)
      expect(mc.map((i) => i.key[0])).toEqual(base.keys)
      expect(mc[0]!.standards).toEqual(['[9사(지리)01-01]'])
      expect(p.standards.map((s) => s.code).sort()).toEqual([...codes].sort())
    })
  }
})

describe('파일 형식 판별 (문서보안·암호)', () => {
  it('xlsx·xls·텍스트와 알 수 없는 바이너리를 구분하고, 문서보안 파일에는 안내 문구를 낸다', async () => {
    expect(sniffFormat(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip')
    expect(sniffFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toBe('ole')
    expect(sniffFormat(new TextEncoder().encode('<html><table><tr><td>1</td></tr></table></html>'))).toBe('text')
    expect(sniffFormat(new TextEncoder().encode('SCDSA002 secured document'))).toBe('drm')
    const junk = new Uint8Array(600).map((_, i) => (i * 37) % 256)
    expect(sniffFormat(junk)).toBe('drm')
    await expect(readWorkbookData(junk, 'secured.xlsx')).rejects.toThrow(/문서보안/)
    await expect(readWorkbookData(new Uint8Array(0), 'empty.xlsx')).rejects.toThrow(/빈 파일/)
  })
})
