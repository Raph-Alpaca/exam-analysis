/**
 * NEIS 양식을 흉내 낸 합성 데이터 생성기.
 * 실제 학생 이름·학번은 절대 사용하지 않는다 ("학생01", 9900000001 …).
 * 테스트(메모리 AOA)와 데모 파일(scripts/make-demo.ts)이 공유한다.
 */
import { mulberry32 } from './rng.ts'

export type Aoa = (string | number | null)[][]

export interface AnswerSheetSpec {
  classNo: number
  nItems: number
  nStudents: number
  style: '_1' | '_2'
  keys?: number[]
  points?: number[]
  /** 교사가 추가한 서답형 열 */
  crCols?: { label: string; points: number }[]
  /** 문항번호 → 정답행에 넣을 알파벳 코드 (복수정답) */
  multiKeyItems?: Record<number, string>
  /** 특정 학생(0-based)·문항(1-based)에 강제로 넣을 응답 문자열 */
  overrides?: Record<string, string>
  seed?: number
  year?: string
  semester?: string
  grade?: string
  examName?: string
  subject?: string
  /** 반/번호를 "01/01"처럼 0패딩 */
  zeroPad?: boolean
}

export interface GeneratedStudent {
  classNo: string
  seatNo: number
  studentId: string
  name: string
  cells: string[] // 문항별 원본 문자열 ('.', '3', '-', 'I' …)
  crScores: number[]
  mc: number
  cr: number
  total: number
}

export interface AnswerSheetFixture {
  aoa: Aoa
  keys: number[]
  keyCells: string[]
  points: number[]
  crCols: { label: string; points: number }[]
  mcMax: number
  crMax: number
  students: GeneratedStudent[]
  headerLine: string
}

const LEGEND =
  '※ . : 맞음  ,  번호 : 틀림  ,  알파벳 : 복수답안코드  ,  - : 무표기A=1,2 , B=1,3 , C=1,4 , D=1,5 , E=2,3 , F=2,4 , G=2,5 , H=3,4 , I=3,5 , J=4,5 , K=1,2,3 , L=1,2,4 , M=1,2,5 , N=1,3,4 , O=1,3,5 ,P=1,4,5 , Q=2,3,4 , R=2,3,5 , S=2,4,5 , T=3,4,5 , U=1,2,3,4 , V=1,2,3,5 , W=1,2,4,5 , X=1,3,4,5 , Y=2,3,4,5 , Z=1,2,3,4,5'

export function makeAnswerSheet(spec: AnswerSheetSpec): AnswerSheetFixture {
  const rnd = mulberry32(spec.seed ?? 1)
  const n = spec.nItems
  const keys = spec.keys ?? Array.from({ length: n }, () => 1 + Math.floor(rnd() * 5))
  const points = spec.points ?? Array.from({ length: n }, () => 3 + Math.floor(rnd() * 3))
  const crCols = spec.crCols ?? []
  const mcMax = points.reduce((a, b) => a + b, 0)
  const crMax = crCols.reduce((a, c) => a + c.points, 0)
  const year = spec.year ?? '2026'
  const semester = spec.semester ?? '1'
  const grade = spec.grade ?? '3'
  const examName = spec.examName ?? '중간고사'
  const subject = spec.subject ?? '과학'
  const headerLine = `${year}학년도   ${semester}학기   주간 ${grade}학년   ${spec.classNo}반   ${examName}   ${subject}`

  const keyCells = keys.map((k, i) => spec.multiKeyItems?.[i + 1] ?? String(k))
  const pad = (v: number) => (spec.zeroPad ? String(v).padStart(2, '0') : String(v))

  const students: GeneratedStudent[] = []
  for (let s = 0; s < spec.nStudents; s++) {
    const ability = 0.25 + rnd() * 0.75
    const cells: string[] = []
    let mc = 0
    for (let i = 0; i < n; i++) {
      const ov = spec.overrides?.[`${s}:${i + 1}`]
      let cell: string
      if (ov != null) cell = ov
      else if (rnd() < ability) cell = '.'
      else {
        const r = rnd()
        if (r < 0.03) cell = '-'
        else if (r < 0.05) cell = 'I'
        else {
          let w = 1 + Math.floor(rnd() * 5)
          if (w === keys[i]) w = (w % 5) + 1
          cell = String(w)
        }
      }
      cells.push(cell)
      if (cell === '.') mc += points[i]!
    }
    const crScores = crCols.map((c) => Math.round(rnd() * c.points))
    const cr = crScores.reduce((a, b) => a + b, 0)
    students.push({
      classNo: String(spec.classNo),
      seatNo: s + 1,
      studentId: `99${String(spec.classNo).padStart(2, '0')}${String(s + 1).padStart(6, '0')}`,
      name: `학생${String(s + 1).padStart(2, '0')}`,
      cells,
      crScores,
      mc,
      cr,
      total: mc + cr,
    })
  }

  const aoa: Aoa = []
  if (spec.style === '_1') aoa.push([...Array(19).fill(null), '2026.11.01.'])
  else aoa.push([])
  aoa.push([...Array(8).fill(null), '정기시험교과목별 학생답 정오표'])
  aoa.push([headerLine])
  const itemHdr: (string | number | null)[] = ['반/번호', null, '번호', ...keys.map((_, i) => i + 1), ...crCols.map((c) => c.label), '선택형점수', '서답형점수', '기타점수', '영역총점']
  aoa.push(itemHdr)
  aoa.push([null, null, '정답', ...keyCells.map((k) => (/^\d+$/.test(k) ? Number(k) : k)), ...crCols.map(() => null)])
  aoa.push([null, null, '배점', ...points, ...crCols.map((c) => c.points), mcMax, crMax, 0, mcMax + crMax])
  for (const st of students) {
    aoa.push([
      `${pad(Number(st.classNo))}/${pad(st.seatNo)}`,
      Number(st.studentId),
      st.name,
      ...st.cells.map((c) => (/^\d+$/.test(c) ? Number(c) : c)),
      ...st.crScores,
      st.mc,
      st.cr,
      0,
      st.total,
    ])
  }
  aoa.push([LEGEND])
  aoa.push([...Array(18).fill(null), 1, null, '/', null, 1, null, null, null, null, '테스트중학교'])
  return { aoa, keys, keyCells, points, crCols, mcMax, crMax, students, headerLine }
}

export interface ItemInfoSpec {
  nItems: number
  keys: number[]
  points: number[]
  /** 문항별 성취기준 코드 (한 문항에 여러 개 가능) */
  standards: string[][]
  standardText: Record<string, string>
  domains: string[]
  difficulties: ('어려움' | '보통' | '쉬움')[]
  crItems?: { label: string; points: number; standards: string[]; domain: string }[]
  subject?: string
  year?: string
  semester?: string
  grade?: string
  examName?: string
  /** 페이지 나눔 위치 (이 문항 다음에 푸터+고아행 삽입) */
  pageBreakAfter?: number
}

export function makeItemInfo(spec: ItemInfoSpec): Aoa {
  const subject = spec.subject ?? '과학'
  const mcMax = spec.points.reduce((a, b) => a + b, 0)
  const crMax = (spec.crItems ?? []).reduce((a, c) => a + c.points, 0)
  const aoa: Aoa = []
  aoa.push([`( ${subject} ) 과목`])
  aoa.push([null, null, null, null, null, null, null, null, null, null, '계', '부 장', '교 감', '교 장'])
  aoa.push([' 문  항  정  보  표', null, null, '(과목 코드 : 06)'])
  aoa.push([`${spec.year ?? '2026'}년도 ${spec.semester ?? '1'}학기 ${spec.examName ?? '중간고사'}`, `${spec.grade ?? '3'}학년`, null, null, `총 문항수 ${spec.nItems + (spec.crItems?.length ?? 0)} 문항`])
  aoa.push(['고사일시 2026년 04월 23일 2교시', null, '공동출제자'])
  aoa.push([`총점 ${(mcMax + crMax).toFixed(2)} 점`, null, `선택형 ${mcMax.toFixed(2)} 점  서답형 ${crMax.toFixed(2)} 점`])
  aoa.push(['선택형 문항'])
  aoa.push(['문항번호', '내용영역', '성취기준', '난이도', null, null, '배점', '정답'])
  aoa.push([null, null, null, '어려움', '보통', '쉬움'])
  const diffCols = { 어려움: 3, 보통: 4, 쉬움: 5 } as const
  const brk = spec.pageBreakAfter ?? 0
  for (let i = 0; i < spec.nItems; i++) {
    const codes = spec.standards[i]!
    let text = codes.map((c) => `${c} ${spec.standardText[c] ?? ''}`).join('')
    const row: (string | number | null)[] = [i + 1, spec.domains[i]!, null, null, null, null, spec.points[i]!, spec.keys[i]!]
    row[diffCols[spec.difficulties[i]!]] = '○'
    if (brk && i + 1 === brk && text.length > 40) {
      // NEIS처럼 페이지 끝에서 성취기준이 잘리고 푸터 뒤 고아행으로 이어짐
      const cut = Math.floor(text.length / 2)
      row[2] = text.slice(0, cut)
      aoa.push(row)
      aoa.push([null, null, null, null, null, 1, '/', 2, null, '테스트중학교'])
      aoa.push([null, null, text.slice(cut)])
      continue
    }
    row[2] = text
    aoa.push(row)
    if (brk && i + 1 === brk) aoa.push([null, null, null, null, null, 1, '/', 2, null, '테스트중학교'])
  }
  if (spec.crItems?.length) {
    aoa.push(['서답형 문항'])
    aoa.push(['문항번호', '내용영역', '성취기준', '난이도', null, null, '배점', '정답'])
    aoa.push([null, null, null, '어려움', '보통', '쉬움'])
    spec.crItems.forEach((c, i) => {
      const text = c.standards.map((s) => `${s} ${spec.standardText[s] ?? ''}`).join('')
      aoa.push([i + 1, c.domain, text, null, '○', null, c.points, null])
    })
  }
  const counts = { 어려움: 0, 보통: 0, 쉬움: 0 }
  for (const d of spec.difficulties) counts[d]++
  aoa.push(['총합계', null, null, counts.어려움, counts.보통, counts.쉬움, mcMax + crMax, '-'])
  aoa.push(['비율(%)', null, null, 12, 76, 12, 100, '-'])
  aoa.push([null, null, null, null, null, 2, '/', 2])
  return aoa
}

export interface AnswerKeySpec {
  keys: number[]
  points: number[]
  multi?: Record<number, string> // 문항번호 → 복수구분 표기
  subject?: string
  examName?: string
}

/** `_1` 양식의 "정기시험 교과목별 정답/배점" (4열 블록 × 4, 시작열 A/F/L/R) */
export function makeAnswerKey(spec: AnswerKeySpec): Aoa {
  const mcMax = spec.points.reduce((a, b) => a + b, 0)
  const aoa: Aoa = []
  aoa.push([...Array(18).fill(null), '2026.11.01.'])
  aoa.push([null, null, null, '정기시험 교과목별 정답/배점'])
  aoa.push(['2026학년도    2학기   주간   3학년'])
  aoa.push([`고사 :   ${spec.examName ?? '3학년 기말고사'}    교과목 :  ${spec.subject ?? '과학'}`])
  aoa.push(['과목점수', null, null, null, '과목만점'])
  aoa.push(['선택형만점', '서답형만점', '기타점수', '가산점'])
  aoa.push([mcMax, 0, 0, 0, mcMax])
  aoa.push(['선택형'])
  const starts = [1, 6, 12, 18] // A, F, L, R
  const hdr: (string | number | null)[] = Array(22).fill(null)
  for (const s of starts) {
    hdr[s - 1] = '문항'
    hdr[s] = '배점'
    hdr[s + 1] = '정답'
    hdr[s + 2] = '복수구분'
  }
  aoa.push(hdr)
  for (let r = 0; r < 15; r++) {
    const row: (string | number | null)[] = Array(22).fill(null)
    starts.forEach((s, b) => {
      const no = b * 15 + r + 1
      row[s - 1] = no
      if (no <= spec.keys.length) {
        row[s] = spec.points[no - 1]!
        row[s + 1] = spec.keys[no - 1]!
        if (spec.multi?.[no]) row[s + 2] = spec.multi[no]!
      }
    })
    aoa.push(row)
  }
  aoa.push([...Array(10).fill(null), 1, null, '/', 1, null, '테스트중학교'])
  return aoa
}

export interface ItemAnalysisSpec {
  /** 반 수치 */
  classCounts: number[][] // [item][choice 1..5]
  gradeCounts: number[][]
  keys: number[]
  classBlank?: number[]
  gradeBlank?: number[]
  classMulti?: number[]
  gradeMulti?: number[]
  /** 합계·정답률 분모 (NEIS는 학생 수). 없으면 답지 합 + 무표기 + 중복으로 계산 */
  classN?: number
  gradeN?: number
  rowsPerPage?: number
}

export function makeItemAnalysis(spec: ItemAnalysisSpec): Aoa {
  const n = spec.keys.length
  const perPage = spec.rowsPerPage ?? 16
  const aoa: Aoa = []
  aoa.push([])
  aoa.push([])
  aoa.push([null, null, null, null, '정기시험 문항분석표 조회'])
  aoa.push([])
  aoa.push([null, '2026학년도   1학기   주간 3학년   1'])
  aoa.push([])
  aoa.push([null, '고사 :  중간고사   교과목 :  과학'])
  aoa.push([])
  aoa.push([null, '※ ()안 숫자는 학년전체 응답인원 수에 대한 정보입니다.'])
  let page = 1
  const totalPages = Math.ceil(n / perPage)
  for (let i = 0; i < n; i++) {
    if (i % perPage === 0) {
      aoa.push([])
      aoa.push([null, '          답안번호\n문항번호', '1번', '2번', '3번', '4번', null, '5번', null, null, null, '합계', null, null, '정답', null, null, null, '정답률(%)', null, '무표기', '중복표기'])
    }
    const cc = spec.classCounts[i]!
    const gc = spec.gradeCounts[i]!
    const cn = spec.classN ?? cc.reduce((a, b) => a + b, 0) + (spec.classBlank?.[i] ?? 0) + (spec.classMulti?.[i] ?? 0)
    const gn = spec.gradeN ?? gc.reduce((a, b) => a + b, 0) + (spec.gradeBlank?.[i] ?? 0) + (spec.gradeMulti?.[i] ?? 0)
    const k = spec.keys[i]! - 1
    const cp = (100 * cc[k]!) / cn
    const gp = (100 * gc[k]!) / gn
    const row: (string | number | null)[] = Array(21).fill(null)
    row[1] = i + 1
    row[2] = `${cc[0]}(${gc[0]})`
    row[3] = `${cc[1]}(${gc[1]})`
    row[4] = `${cc[2]}(${gc[2]})`
    row[5] = `${cc[3]}(${gc[3]})`
    row[7] = `${cc[4]}(${gc[4]})`
    row[11] = cn
    row[14] = spec.keys[i]!
    row[18] = `  ${cp.toFixed(2)}(  ${gp.toFixed(2)})`
    if (spec.classBlank?.[i] != null) row[20] = `${spec.classBlank[i]}(${spec.gradeBlank?.[i] ?? 0})`
    if (spec.classMulti?.[i] != null) row[21] = `${spec.classMulti[i]}(${spec.gradeMulti?.[i] ?? 0})`
    aoa.push(row)
    if ((i + 1) % perPage === 0 || i === n - 1) {
      aoa.push([])
      aoa.push([...Array(9).fill(null), page, '/', null, totalPages, null, null, null, page === totalPages ? '테스트중학교' : null])
      page++
    }
  }
  return aoa
}
