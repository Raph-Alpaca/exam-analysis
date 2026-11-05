/**
 * 실제 NEIS 샘플 파일로 검증하는 테스트.
 * 샘플은 저장소에 없으므로 환경변수 NEIS_SAMPLE_DIR 이 있을 때만 실행된다.
 * NEIS_SAMPLE_DIR 은 샘플 폴더 하나이거나, "분석할 자료*" 하위 폴더들을 가진 상위 폴더.
 *   PowerShell: $env:NEIS_SAMPLE_DIR="C:\Users\user\Desktop\성취평가"; npm test -- --run
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readWorkbookData } from '../src/xlsx/readWorkbook'
import { writeFileSync } from 'node:fs'
import { buildExam, parseGrids, type ParsedFile } from '../src/parsers/index'
import { analyze } from '../src/stats/analyze'
import { DEFAULT_SETTINGS } from '../src/model/settings'
import { buildWorkbook, exportFileName } from '../src/export/excel'
import { buildNeisTable } from '../src/stats/neisTable'

const root = process.env.NEIS_SAMPLE_DIR
const dirs: string[] = []
if (root && existsSync(root)) {
  const subs = readdirSync(root).filter((d) => /분석할 자료/.test(d) && statSync(join(root, d)).isDirectory())
  if (subs.length) dirs.push(...subs.map((d) => join(root, d)))
  else dirs.push(root)
}
const run = dirs.length ? describe : describe.skip

async function loadDir(dir: string): Promise<ParsedFile[]> {
  const files = readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f))
  const out: ParsedFile[] = []
  for (const f of files) {
    const grids = await readWorkbookData(readFileSync(join(dir, f)), f)
    out.push(parseGrids(grids, f))
  }
  return out
}

run('실제 NEIS 샘플 (NEIS_SAMPLE_DIR)', () => {
  for (const dir of dirs) {
    describe(dir, () => {
      it('모든 파일이 판별·파싱되고 하나의 시험으로 합쳐진다', async () => {
        const parsed = await loadDir(dir)
        for (const p of parsed) {
          expect(p.kind, p.fileName).not.toBe('unknown')
          expect(p.error, p.fileName).toBeUndefined()
        }
        const { exam, errors } = buildExam(parsed)
        expect(errors).toEqual([])
        expect(exam).not.toBeNull()
        const e = exam!
        expect(e.classes.length).toBe(2)
        expect(e.items.filter((i) => i.kind === 'mc').length).toBeGreaterThanOrEqual(25)
        expect(e.maxima.total).toBe(100)
        expect(e.header.subject).toBe('과학')
        for (const c of e.classes) expect(c.students.length).toBeGreaterThanOrEqual(25)
      })

      it('정오표: 응답으로 계산한 점수가 NEIS 영역총점과 같고 학번은 문자열이다', async () => {
        const parsed = await loadDir(dir)
        for (const p of parsed) {
          if (!p.answers) continue
          for (const st of p.answers.students) {
            expect(st.studentId, `${p.fileName} ${st.id}`).toMatch(/^\d{8,}$/)
            const calc = st.responses.reduce((s, r, i) => s + (r.k === 'correct' ? p.answers!.mcItems[i]!.points! : 0), 0)
            expect(calc, `${p.fileName} ${st.id}`).toBeCloseTo(st.neis.mc, 6)
            expect(calc + st.neis.cr + st.neis.etc, `${p.fileName} ${st.id}`).toBeCloseTo(st.neis.total, 6)
          }
        }
      })

      it('문항분석표가 있으면 1반 정오표의 답지별 인원·정답률과 일치한다', async () => {
        const parsed = await loadDir(dir)
        const ana = parsed.find((p) => p.itemAnalysis)?.itemAnalysis
        if (!ana) return
        const ans = parsed.find((p) => p.answers && p.answers.classNos[0] === '1')!.answers!
        expect(ana.items.length).toBe(ans.mcItems.length)
        expect(ana.classN).toBe(ans.students.length)
        expect(ana.gradeN).toBeGreaterThan(ans.students.length)
        ans.mcItems.forEach((it, i) => {
          const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
          for (const st of ans.students) {
            const r = st.responses[i]!
            if (r.k === 'correct') counts[it.key!.key[0]! as 1 | 2 | 3 | 4 | 5]++
            else if (r.k === 'wrong') counts[r.choice as 1 | 2 | 3 | 4 | 5]++
            else if (r.k === 'multi') for (const c of r.choices) counts[c as 1 | 2 | 3 | 4 | 5]++
          }
          const ref = ana.items[i]!
          expect(ref.no).toBe(it.no)
          expect(ref.key).toBe(it.key!.key[0])
          for (const k of [1, 2, 3, 4, 5] as const) expect(ref.classCounts[k], `문항 ${it.no} 답지 ${k}`).toBe(counts[k])
          const p = (100 * counts[it.key!.key[0]! as 1 | 2 | 3 | 4 | 5]) / ans.students.length
          expect(p, `문항 ${it.no} 정답률`).toBeCloseTo(ref.classP!, 2)
        })
      })

      it('문항정보표가 있으면 성취기준·난이도·내용영역이 문항에 붙는다', async () => {
        const parsed = await loadDir(dir)
        const ii = parsed.find((p) => p.itemInfo)?.itemInfo
        if (!ii) return
        const { exam } = buildExam(parsed)
        expect(exam!.hasItemInfo).toBe(true)
        const mc = exam!.items.filter((i) => i.kind === 'mc')
        expect(mc.every((i) => i.standards.length >= 1)).toBe(true)
        expect(mc.every((i) => i.difficulty != null)).toBe(true)
        expect(mc.every((i) => !!i.domain)).toBe(true)
        expect(exam!.standards.length).toBeGreaterThanOrEqual(5)
        for (const s of exam!.standards) {
          expect(s.code).toMatch(/^\[.+\]$/)
          expect(s.text.length).toBeGreaterThan(10)
          expect(s.text.endsWith('.')).toBe(true) // 잘린 성취기준이 이어붙여졌는지
        }
        const diff = { 어려움: 0, 보통: 0, 쉬움: 0 }
        for (const i of mc) diff[i.difficulty!]++
        expect(diff.어려움 + diff.보통 + diff.쉬움).toBe(mc.length)
      })

      it('분석·엑셀 내보내기가 오류 없이 된다 (NEIS_EXPORT_DIR 지정 시 파일 저장)', async () => {
        const parsed = await loadDir(dir)
        const { exam } = buildExam(parsed)
        const result = analyze(exam!, DEFAULT_SETTINGS)
        expect(result.students.length).toBe(exam!.classes.reduce((a, c) => a + c.students.length, 0))
        expect(result.warnings.filter((w) => w.code === 'score-mismatch')).toEqual([])
        const wb = await buildWorkbook(exam!, result, DEFAULT_SETTINGS)
        const buf = await wb.xlsx.writeBuffer()
        expect(buf.byteLength).toBeGreaterThan(10000)
        if (process.env.NEIS_EXPORT_DIR) writeFileSync(join(process.env.NEIS_EXPORT_DIR, exportFileName(exam!)), Buffer.from(buf))
      })

      it('문항분석표가 있으면 사이트의 재구성 표가 원본 문항분석표와 모든 칸에서 같다', async () => {
        const parsed = await loadDir(dir)
        const iaFile = parsed.find((p) => p.itemAnalysis)
        if (!iaFile) return
        const { exam, warnings } = buildExam(parsed)
        expect(warnings.some((w) => w.code === 'itemanalysis-verified')).toBe(true)
        const ref = exam!.gradeReference!
        expect(ref.verified).toBe(true)
        const table = buildNeisTable(exam!, ref.classNo!, DEFAULT_SETTINGS)!
        // 원본 파일을 파서와 별개로 직접 읽는다: 머리글 행에서 열 위치를 찾고, 빈 무표기·중복표기 칸은 같은 페이지 위 값
        const grid = (await readWorkbookData(readFileSync(join(dir, iaFile.fileName)), iaFile.fileName))[0]!
        const raw: Record<number, string[]> = {}
        let cols: number[] | null = null
        let last: [string, string] = ['0(0)', '0(0)']
        for (let r = 1; r <= grid.rows; r++) {
          const t = grid.rowTexts(r).map((x) => x.replace(/\s+/g, ''))
          if (t.includes('1번') && t.some((x) => x.includes('문항번호'))) {
            const idx = (re: RegExp) => t.findIndex((x) => re.test(x)) + 1
            cols = [idx(/문항번호/), idx(/^1번$/), idx(/^2번$/), idx(/^3번$/), idx(/^4번$/), idx(/^5번$/), idx(/^합계$/), idx(/^정답$/), idx(/정답률/), idx(/무표기/), idx(/중복표기/)]
            last = ['0(0)', '0(0)']
            continue
          }
          if (!cols) continue
          const no = grid.int(r, cols[0]!)
          if (no == null || !/^\d+\(\d+\)$/.test(t[cols[1]! - 1] ?? '')) continue
          const blank = t[cols[9]! - 1] || last[0]
          const multi = t[cols[10]! - 1] || last[1]
          last = [blank, multi]
          raw[no] = [...[1, 2, 3, 4, 5].map((k) => t[cols![k]! - 1]!), String(grid.int(r, cols[6]!)), String(grid.int(r, cols[7]!)), t[cols[8]! - 1]!, blank, multi]
        }
        expect(Object.keys(raw)).toHaveLength(table.rows.length)
        for (const row of table.rows) {
          const ours = [...row.cells, String(row.sum), row.keyText, row.p, row.blank, row.multi]
          expect(ours, `문항 ${row.no}`).toEqual(raw[row.no])
        }
      })

      it('정답/배점표가 있으면 정오표와 정답·배점이 일치한다', async () => {
        const parsed = await loadDir(dir)
        const ak = parsed.find((p) => p.answerKey)?.answerKey
        if (!ak) return
        const ans = parsed.find((p) => p.answers)!.answers!
        const akMc = ak.items.filter((i) => i.kind === 'mc')
        expect(akMc.length).toBe(ans.mcItems.length)
        akMc.forEach((i, idx) => {
          expect(i.no).toBe(ans.mcItems[idx]!.no)
          expect(i.key).toEqual(ans.mcItems[idx]!.key!.key)
          expect(i.points).toBe(ans.mcItems[idx]!.points)
        })
        expect(ak.maxima.total).toBe(100)
        const { warnings } = buildExam(parsed)
        expect(warnings.filter((w) => w.code === 'answerkey-mismatch')).toEqual([])
      })
    })
  }
})
