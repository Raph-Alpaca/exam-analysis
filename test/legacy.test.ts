/**
 * 기존 KICE 프로그램(v1.1) 샘플 "과목C 학생답정오표(서답형).xls" 로
 * 성취도분석·선다형분석 결과 수치를 재현하는지 검증한다.
 * 환경변수 KICE_SAMPLE_XLS 에 xls 경로가 있을 때만 실행.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { readWorkbookData } from '../src/xlsx/readWorkbook'
import { buildExam, parseGrids } from '../src/parsers/index'
import { analyze } from '../src/stats/analyze'
import { DEFAULT_SETTINGS } from '../src/model/settings'

const xls = process.env.KICE_SAMPLE_XLS
const run = xls && existsSync(xls) ? describe : describe.skip

run('KICE 과목C 샘플 재현', () => {
  it('성취도분석·문항별 수치가 기존 프로그램 출력과 일치한다', async () => {
    const grids = await readWorkbookData(readFileSync(xls!), '과목C.xls')
    const parsed = parseGrids(grids, '과목C.xls')
    expect(parsed.error).toBeUndefined()
    expect(parsed.kind).toBe('answers')
    const { exam, errors } = buildExam([parsed])
    expect(errors).toEqual([])
    const e = exam!
    expect(e.items.filter((i) => i.kind === 'mc')).toHaveLength(13)
    expect(e.items.filter((i) => i.kind === 'cr')).toHaveLength(8)
    expect(e.maxima).toMatchObject({ mc: 50, cr: 50, total: 100 })
    expect(e.classes).toHaveLength(11)

    const r = analyze(e, { ...DEFAULT_SETTINGS, scoreSource: 'recomputed' })
    expect(r.overview.n).toBe(353)
    // 성취도분석(전체): 평균/표준편차 (모집단)
    expect(r.overview.total.mean).toBeCloseTo(57.6, 1)
    expect(r.overview.total.sd).toBeCloseTo(27.6, 1)
    expect(r.overview.mc.mean).toBeCloseTo(36.3, 1)
    expect(r.overview.mc.sd).toBeCloseTo(13.4, 1)
    expect(r.overview.cr.mean).toBeCloseTo(21.2, 1)
    expect(r.overview.cr.sd).toBeCloseTo(15.5, 1)
    expect(r.overview.alphaMc).toBeCloseTo(0.876, 3)
    // 성취수준 비율
    expect(r.overview.levelPct.A).toBeCloseTo(11.6, 1)
    expect(r.overview.levelPct.B).toBeCloseTo(17.3, 1)
    expect(r.overview.levelPct.C).toBeCloseTo(14.7, 1)
    expect(r.overview.levelPct.D).toBeCloseTo(12.7, 1)
    expect(r.overview.levelPct.E).toBeCloseTo(43.6, 1)
    // 학급별
    expect(r.byClass['1']!.total.mean).toBeCloseTo(55.9, 1)
    expect(r.byClass['1']!.total.sd).toBeCloseTo(27.8, 1)
    expect(r.byClass['2']!.total.mean).toBeCloseTo(64.4, 1)
    expect(r.byClass['2']!.total.sd).toBeCloseTo(22.8, 1)
    // 선다형분석_문항별: 정답률·변별도·답지반응률
    expect(r.items[0]!.p).toBeCloseTo(85.8, 1)
    expect(r.items[0]!.disc).toBeCloseTo(0.47, 2)
    expect(r.items[2]!.disc).toBeCloseTo(0.68, 2)
    expect(r.items[7]!.disc).toBeCloseTo(0.61, 2)
    expect(r.items[12]!.p).toBeCloseTo(33.4, 1)
    expect(r.items[12]!.disc).toBeCloseTo(0.19, 2)
    expect(r.items[12]!.pct[1]).toBeCloseTo(14.4, 1)
    expect(r.items[12]!.pct[3]).toBeCloseTo(27.2, 1)
    expect(r.items[12]!.pct.none).toBeCloseTo(5.1, 1)
    // 성취수준별 문항 (문항1: A 100, E 70.1)
    expect(r.itemsByLevel.A[0]!.p).toBeCloseTo(100, 1)
    expect(r.itemsByLevel.E[0]!.p).toBeCloseTo(70.1, 1)
    // 학급별 문항 (1반 문항13 정답률 35.3, 변별도 .30)
    expect(r.itemsByClass['1']![12]!.p).toBeCloseTo(35.3, 1)
    expect(r.itemsByClass['1']![12]!.disc).toBeCloseTo(0.3, 2)
    // 서답형 (서답1 평균 4.1, SD 2.6, A 수준 평균 5.8)
    expect(r.constructed).toHaveLength(8)
    expect(r.constructed[0]!.overall.mean).toBeCloseTo(4.1, 1)
    expect(r.constructed[0]!.overall.sd).toBeCloseTo(2.6, 1)
    expect(r.constructed[0]!.byLevel.A.mean).toBeCloseTo(5.8, 1)
    expect(r.constructed[0]!.byLevel.A.dist['6']).toBeCloseTo(92.7, 1)
  })
})
