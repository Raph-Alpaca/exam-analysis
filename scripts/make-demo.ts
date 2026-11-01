/**
 * 합성 데모 파일 생성: public/demo/*.xlsx + manifest.json
 *   node scripts/make-demo.ts
 * 실제 학생 정보는 전혀 포함하지 않는다 (학생01…, 학번 99xx…).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { makeAnswerSheet, makeItemAnalysis, makeItemInfo, type Aoa } from '../test/fixtures/neis.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public', 'demo')
mkdirSync(out, { recursive: true })

const N_ITEMS = 25
const CLASSES = [1, 2, 3]
const STD: Record<string, string> = {
  '[9과17-01]': '물리 변화와 화학 변화의 차이를 알고, 일상생활에서 물리 변화와 화학 변화의 예를 찾을 수 있다.',
  '[9과17-02]': '간단한 화학 반응을 화학 반응식으로 표현하고, 화학 반응식에서 계수의 비를 입자 수의 비로 해석할 수 있다.',
  '[9과17-03]': '질량 보존 법칙을 이해하고, 이를 모형을 사용하여 설명할 수 있다.',
  '[9과17-04]': '화합물을 구성하는 성분 원소의 질량에 관한 자료를 해석하여 일정 성분비 법칙을 설명할 수 있다.',
  '[9과17-05]': '기체 반응 법칙을 이해하고, 이를 실험을 통해 확인할 수 있다.',
  '[9과17-06]': '화학 반응에서 에너지의 출입을 이해하고, 이를 활용한 장치를 설계할 수 있다.',
  '[9과18-01]': '기권의 층상 구조를 이해하고, 온실 효과와 지구 온난화를 복사 평형의 관점으로 설명할 수 있다.',
  '[9과19-01]': '등속 운동하는 물체의 시간-거리, 시간-속력의 관계를 표현하고 설명할 수 있다.',
  '[9과19-02]': '물체의 자유 낙하 운동을 분석하여 시간에 따른 속력의 변화가 일정함을 설명할 수 있다.',
}
const codes = Object.keys(STD)
const DOMAINS = ['물리 변화와 화학 변화', '화학 반응식', '질량 보존 법칙', '일정 성분비 법칙', '기체 반응 법칙', '에너지 출입 반응', '기권과 복사 평형', '등속 운동', '자유 낙하 운동']
const stdOfItem = (i: number) => Math.min(codes.length - 1, Math.floor((i * codes.length) / N_ITEMS))
const keys = [4, 2, 2, 1, 3, 3, 5, 3, 1, 5, 1, 2, 1, 4, 5, 3, 4, 4, 5, 3, 2, 3, 5, 1, 2]
const points = [4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4, 5, 4, 4, 4, 4, 5, 3, 4, 3, 4, 3, 4]
const difficulties = points.map((p) => (p === 5 ? '어려움' : p === 3 ? '쉬움' : '보통')) as ('어려움' | '보통' | '쉬움')[]

function write(name: string, aoa: Aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa as (string | number | null)[][])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'sheet1')
  writeFileSync(join(out, name), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
  return name
}

const files: string[] = []
const sheets = CLASSES.map((c) => makeAnswerSheet({ classNo: c, nItems: N_ITEMS, nStudents: 25 + (c % 2), style: '_2', seed: 2026 + c, keys, points, examName: '중간고사', subject: '과학', year: '2026', semester: '1', grade: '3' }))
sheets.forEach((fx, i) => files.push(write(`예시중_1학기_중간_과학_교과목별_학생답_정오표_${CLASSES[i]}반.xlsx`, fx.aoa)))

files.push(
  write(
    '예시중_1학기_중간_과학_문항정보표.xlsx',
    makeItemInfo({
      nItems: N_ITEMS,
      keys,
      points,
      standards: Array.from({ length: N_ITEMS }, (_, i) => (i === 12 ? [codes[1]!, codes[3]!] : [codes[stdOfItem(i)]!])),
      standardText: STD,
      domains: Array.from({ length: N_ITEMS }, (_, i) => DOMAINS[stdOfItem(i)]!),
      difficulties,
      subject: '과학',
      examName: '중간고사',
      pageBreakAfter: 13,
    }),
  ),
)

// 문항분석표: 1반 수치 + 괄호 안 전체(3개 반)
const count = (list: typeof sheets) =>
  Array.from({ length: N_ITEMS }, (_, i) => {
    const cc = [0, 0, 0, 0, 0]
    let blank = 0
    let multi = 0
    for (const fx of list)
      for (const st of fx.students) {
        const v = st.cells[i]!
        if (v === '.') cc[keys[i]! - 1]!++
        else if (/^\d$/.test(v)) cc[Number(v) - 1]!++
        else if (v === '-') blank++
        else {
          multi++
          cc[2]!++
          cc[4]!++
        }
      }
    return { cc, blank, multi }
  })
const own = count([sheets[0]!])
const all = count(sheets)
files.push(
  write(
    '예시중_1학기_중간_과학_문항분석표.xlsx',
    makeItemAnalysis({
      keys,
      classCounts: own.map((x) => x.cc),
      gradeCounts: all.map((x) => x.cc),
      classBlank: own.map((x) => x.blank),
      gradeBlank: all.map((x) => x.blank),
      classMulti: own.map((x) => x.multi),
      gradeMulti: all.map((x) => x.multi),
      classN: sheets[0]!.students.length,
      gradeN: sheets.reduce((a, s) => a + s.students.length, 0),
    }),
  ),
)

writeFileSync(join(out, 'manifest.json'), JSON.stringify({ files }, null, 2))
console.log('demo files:', files)
