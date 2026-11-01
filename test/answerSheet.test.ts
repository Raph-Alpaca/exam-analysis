import { describe, expect, it } from 'vitest'
import { gridFromAoa } from './helpers.ts'
import { makeAnswerSheet } from './fixtures/neis.ts'
import { detectKind } from '../src/parsers/detect'
import { parseAnswerSheet } from '../src/parsers/answerSheet'
import { decodeKey, decodeResponse, parseLegendRow } from '../src/parsers/legend'
import { parseExamHeader } from '../src/parsers/header'

describe('응답 코드 디코딩', () => {
  it('., 숫자, -, 알파벳, 무효를 구분한다', () => {
    expect(decodeResponse('.')).toEqual({ k: 'correct' })
    expect(decodeResponse('3')).toEqual({ k: 'wrong', choice: 3 })
    expect(decodeResponse('-')).toEqual({ k: 'blank' })
    expect(decodeResponse('')).toEqual({ k: 'blank' })
    expect(decodeResponse('I')).toEqual({ k: 'multi', choices: [3, 5] })
    expect(decodeResponse('Z')).toEqual({ k: 'multi', choices: [1, 2, 3, 4, 5] })
    expect(decodeResponse('6')).toEqual({ k: 'invalid', raw: '6' })
    expect(decodeResponse('?')).toEqual({ k: 'invalid', raw: '?' })
  })
  it('정답 칸의 숫자/알파벳/복수 표기를 해석한다', () => {
    expect(decodeKey('4')).toEqual({ key: [4], keyMode: 'single' })
    expect(decodeKey('B')).toEqual({ key: [1, 3], keyMode: 'all' })
    expect(decodeKey('1,3')).toEqual({ key: [1, 3], keyMode: 'any' })
    expect(decodeKey('')).toBeNull()
    expect(decodeKey('7')).toBeNull()
  })
  it('범례 행에서 코드표를 읽는다', () => {
    const legend = parseLegendRow('※ . : 맞음 , 번호 : 틀림 , 알파벳 : 복수답안코드 , - : 무표기A=1,2 , B=1,3 , K=1,2,3')
    expect(legend).toEqual({ A: [1, 2], B: [1, 3], K: [1, 2, 3] })
    expect(parseLegendRow('아무 코드 없음')).toBeNull()
  })
})

describe('헤더 행 해석', () => {
  it('학년도·학기·학년·반·고사명·과목을 뽑는다', () => {
    const h = parseExamHeader('2026학년도   1학기   주간 3학년   1반   중간고사   과학')
    expect(h).toMatchObject({ year: '2026', semester: '1', grade: '3', classNo: '1', examName: '중간고사', subject: '과학' })
    const h2 = parseExamHeader('2026학년도   2학기   주간 3학년   2반   3학년 기말고사   과학')
    expect(h2).toMatchObject({ classNo: '2', examName: '3학년 기말고사', subject: '과학' })
  })
})

describe('정오표 파서', () => {
  it('_2 양식(정수)을 읽어 학생·문항·점수를 복원한다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 25, nStudents: 26, style: '_2', seed: 7 })
    const grid = await gridFromAoa(fx.aoa)
    expect(detectKind(grid)).toBe('answers')
    const p = parseAnswerSheet(grid, 'c1.xlsx')
    expect(p.classNos).toEqual(['1'])
    expect(p.header).toMatchObject({ year: '2026', semester: '1', grade: '3', classNo: '1', examName: '중간고사', subject: '과학' })
    expect(p.mcItems.map((i) => i.no)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(p.mcItems.map((i) => i.key?.key[0])).toEqual(fx.keys)
    expect(p.mcItems.map((i) => i.points)).toEqual(fx.points)
    expect(p.crItems).toEqual([])
    expect(p.maxima).toEqual({ mc: fx.mcMax, cr: 0, etc: 0, total: fx.mcMax })
    expect(p.students).toHaveLength(26)
    const s0 = p.students[0]!
    expect(s0.id).toBe('1/1')
    expect(s0.studentId).toBe(fx.students[0]!.studentId)
    expect(s0.name).toBe('학생01')
    expect(s0.neis.total).toBe(fx.students[0]!.total)
    // 응답 디코딩이 원본 코드와 일치
    p.students.forEach((st, si) => {
      st.responses.forEach((r, ii) => {
        const raw = fx.students[si]!.cells[ii]!
        if (raw === '.') expect(r).toEqual({ k: 'correct' })
        else if (raw === '-') expect(r).toEqual({ k: 'blank' })
        else if (raw === 'I') expect(r).toEqual({ k: 'multi', choices: [3, 5] })
        else expect(r).toEqual({ k: 'wrong', choice: Number(raw) })
      })
      const calc = st.responses.reduce((sum, r, i) => sum + (r.k === 'correct' ? p.mcItems[i]!.points! : 0), 0)
      expect(calc).toBe(st.neis.mc)
    })
    expect(p.warnings.filter((w) => w.level === 'error')).toEqual([])
  })

  it('_1 양식(실수·날짜·거짓 dimension·0패딩)도 같은 결과를 낸다', async () => {
    const fx = makeAnswerSheet({ classNo: 2, nItems: 26, nStudents: 25, style: '_1', seed: 3, zeroPad: true, examName: '3학년 기말고사' })
    const grid = await gridFromAoa(fx.aoa, { bogusRef: true })
    expect(grid.rows).toBeGreaterThan(30)
    expect(detectKind(grid)).toBe('answers')
    const p = parseAnswerSheet(grid, 'c2.xlsx')
    expect(p.classNos).toEqual(['2'])
    expect(p.header.examName).toBe('3학년 기말고사')
    expect(p.students).toHaveLength(25)
    expect(p.students[4]!.id).toBe('2/5')
    expect(p.students[4]!.studentId).toMatch(/^\d{10}$/)
    expect(p.students.map((s) => s.neis.total)).toEqual(fx.students.map((s) => s.total))
  })

  it('복수정답 코드가 정답 행에 있으면 keyMode=all 로 읽는다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 10, nStudents: 5, style: '_2', seed: 11, multiKeyItems: { 3: 'B' } })
    const grid = await gridFromAoa(fx.aoa)
    const p = parseAnswerSheet(grid, 'multi.xlsx')
    expect(p.mcItems[2]!.key).toEqual({ key: [1, 3], keyMode: 'all' })
    expect(p.mcItems[0]!.key?.keyMode).toBe('single')
  })

  it('교사가 추가한 서답형 열을 문항별 점수로 읽는다', async () => {
    const fx = makeAnswerSheet({
      classNo: 1,
      nItems: 20,
      nStudents: 8,
      style: '_2',
      seed: 5,
      crCols: [
        { label: '서답1', points: 6 },
        { label: '서답2', points: 8 },
      ],
    })
    const grid = await gridFromAoa(fx.aoa)
    const p = parseAnswerSheet(grid, 'cr.xlsx')
    expect(p.mcItems).toHaveLength(20)
    expect(p.crItems.map((c) => [c.label, c.points])).toEqual([
      ['서답1', 6],
      ['서답2', 8],
    ])
    expect(p.maxima.cr).toBe(14)
    p.students.forEach((st, i) => {
      expect(st.crScores).toEqual(fx.students[i]!.crScores)
      expect(st.neis.cr).toBe(fx.students[i]!.cr)
      expect(st.neis.total).toBe(fx.students[i]!.total)
    })
  })

  it('배점 없는 낯선 열은 무시하고 경고만 남긴다', async () => {
    const fx = makeAnswerSheet({ classNo: 1, nItems: 5, nStudents: 3, style: '_2', seed: 9 })
    // 문항 5와 선택형점수 사이에 '비고' 열 삽입 (배점 없음)
    const aoa = fx.aoa.map((row, r) => {
      const copy = [...row]
      if (r >= 3) copy.splice(3 + 5, 0, r === 3 ? '비고' : null)
      return copy
    })
    const grid = await gridFromAoa(aoa)
    const p = parseAnswerSheet(grid, 'extra.xlsx')
    expect(p.mcItems).toHaveLength(5)
    expect(p.crItems).toHaveLength(0)
    expect(p.warnings.some((w) => w.code === 'extra-column-ignored')).toBe(true)
    expect(p.students[0]!.neis.total).toBe(fx.students[0]!.total)
  })

  it('정오표가 아닌 시트는 오류를 낸다', async () => {
    const grid = await gridFromAoa([['아무 내용'], ['없는 표']])
    expect(detectKind(grid)).toBe('unknown')
    expect(() => parseAnswerSheet(grid, 'x.xlsx')).toThrow(/헤더 행/)
  })
})
