import type { CellGrid } from '../xlsx/readWorkbook'
import type { ExamHeader, KeyMode, Student, Warning } from '../model/types'
import { parseExamHeader } from './header'
import { DEFAULT_MULTI_CODES, decodeKey, decodeResponse, parseLegendRow, type MultiLegend } from './legend'
import { ParseError } from './errors'

export interface McItemCol {
  no: number
  col: number
  key: { key: number[]; keyMode: KeyMode } | null
  points: number | null
}
export interface CrItemCol {
  no: number
  label: string
  col: number
  points: number
}

export interface AnswerSheetParse {
  fileName: string
  header: ExamHeader
  classNos: string[]
  mcItems: McItemCol[]
  crItems: CrItemCol[]
  maxima: { mc: number | null; cr: number | null; etc: number | null; total: number | null }
  students: Student[]
  legend: MultiLegend
  warnings: Warning[]
}

const RE_CLASS_SEAT = /^\s*0*(\d+)\s*[\/\-]\s*0*(\d+)\s*$/
const RE_INT = /^\d+$/
const RE_MC_SCORE = /선택형\s*점수|선다형\s*점수/
const RE_CR_SCORE = /서답형\s*점수|서술형\s*점수/
const RE_ETC_SCORE = /기타\s*점수/
const RE_TOTAL = /영역\s*총점|과목\s*총점|^총점$/

function findHeaderRow(grid: CellGrid): number {
  return grid.findRow((t) => {
    const ints = t.filter((x) => RE_INT.test(x)).length
    return ints >= 3 && t.some((x) => /번호/.test(x))
  }, 1, Math.min(grid.rows, 40))
}

export function parseAnswerSheet(grid: CellGrid, fileName: string): AnswerSheetParse {
  const warnings: Warning[] = []
  const hdrRow = findHeaderRow(grid)
  if (!hdrRow) throw new ParseError('no-header', `${fileName}: 정오표의 문항번호 헤더 행(반/번호 … 번호 1 2 3 …)을 찾지 못했습니다.`)
  const hdr = grid.rowTexts(hdrRow)
  const firstItemCol = hdr.findIndex((x) => RE_INT.test(x)) + 1

  // 메타 행: 학년도 … 를 포함하는 행
  let header: ExamHeader = { raw: '' }
  for (let r = 1; r < hdrRow; r++) {
    const line = grid.rowTexts(r).filter((x) => x !== '').join('   ')
    if (/학년도/.test(line)) {
      header = parseExamHeader(line)
      break
    }
  }
  if (!header.raw) warnings.push({ level: 'info', code: 'header-missing', message: `${fileName}: 학년도·학기·고사명 행을 찾지 못해 파일명으로 표시합니다.` })

  // 정답/배점 행
  const metaCols = Math.max(firstItemCol - 1, 1)
  const keyRow = grid.findRow((t) => t.slice(0, metaCols).some((x) => x === '정답'), hdrRow + 1, hdrRow + 4)
  const ptsRow = grid.findRow((t) => t.slice(0, metaCols).some((x) => x === '배점'), hdrRow + 1, hdrRow + 5)
  if (!keyRow || !ptsRow) throw new ParseError('no-key-rows', `${fileName}: 정답 행 또는 배점 행을 찾지 못했습니다.`)

  // 점수 열
  const findCol = (re: RegExp) => hdr.findIndex((x) => re.test(x.replace(/\s+/g, ''))) + 1
  const mcScoreCol = findCol(RE_MC_SCORE)
  const crScoreCol = findCol(RE_CR_SCORE)
  const etcScoreCol = findCol(RE_ETC_SCORE)
  const totalCol = findCol(RE_TOTAL)
  if (!totalCol) warnings.push({ level: 'warn', code: 'no-total-column', message: `${fileName}: 영역총점 열이 없어 응답으로 총점을 계산합니다.` })

  // 범례
  let legend: MultiLegend = DEFAULT_MULTI_CODES
  const legendCell = grid.findCells(/^※/).find((c) => c.r > ptsRow)
  if (legendCell) {
    const parsed = parseLegendRow(grid.rowTexts(legendCell.r).join(' '))
    if (parsed) legend = { ...DEFAULT_MULTI_CODES, ...parsed }
  }

  // 문항 열
  const itemEnd = mcScoreCol ? mcScoreCol - 1 : grid.cols
  const mcItems: McItemCol[] = []
  const crItems: CrItemCol[] = []
  for (let c = firstItemCol; c <= itemEnd; c++) {
    const h = hdr[c - 1] ?? ''
    if (h === '') continue
    const points = grid.num(ptsRow, c)
    const keyText = grid.text(keyRow, c)
    if (RE_INT.test(h)) {
      const key = decodeKey(keyText, legend)
      if (!key && keyText === '' && points != null && points > 0 && mcItems.length > 0 && /서답|서술/.test(hdr.slice(firstItemCol - 1, c - 1).join(''))) {
        // 선다형 뒤에 숫자 머리글만 있고 정답이 없는 열: 서답형으로 간주
        crItems.push({ no: Number(h), label: `서답${crItems.length + 1}`, col: c, points })
        continue
      }
      if (!key) warnings.push({ level: 'warn', code: 'item-no-key', message: `${fileName}: ${h}번 문항의 정답을 읽지 못했습니다("${keyText}"). 이 문항은 채점에서 제외됩니다.` })
      if (points == null) warnings.push({ level: 'warn', code: 'item-no-points', message: `${fileName}: ${h}번 문항의 배점이 없습니다.` })
      mcItems.push({ no: Number(h), col: c, key, points })
    } else if (RE_CR_SCORE.test(h) || RE_ETC_SCORE.test(h) || RE_TOTAL.test(h)) {
      break
    } else {
      if (points == null || points <= 0) {
        warnings.push({ level: 'info', code: 'extra-column-ignored', message: `${fileName}: "${h}" 열은 배점이 없어 무시했습니다.` })
        continue
      }
      crItems.push({ no: crItems.length + 1, label: h, col: c, points })
    }
  }
  if (mcItems.length === 0) throw new ParseError('no-items', `${fileName}: 선다형 문항 열을 찾지 못했습니다.`)

  // 만점
  const maxima = {
    mc: mcScoreCol ? grid.num(ptsRow, mcScoreCol) : null,
    cr: crScoreCol ? grid.num(ptsRow, crScoreCol) : null,
    etc: etcScoreCol ? grid.num(ptsRow, etcScoreCol) : null,
    total: totalCol ? grid.num(ptsRow, totalCol) : null,
  }

  // 메타 열 결정 (반/번호, 학번, 이름)
  let classCol = hdr.findIndex((x) => x.replace(/\s+/g, '') === '반/번호') + 1
  const firstStudentRow = grid.findRow((t) => t.slice(0, metaCols).some((x) => RE_CLASS_SEAT.test(x)), ptsRow + 1)
  if (!firstStudentRow) throw new ParseError('no-students', `${fileName}: 학생 행(반/번호 형식 "1/1")을 찾지 못했습니다.`)
  const probe = grid.rowTexts(firstStudentRow).slice(0, metaCols)
  if (!classCol || !RE_CLASS_SEAT.test(probe[classCol - 1] ?? '')) classCol = probe.findIndex((x) => RE_CLASS_SEAT.test(x)) + 1
  let idCol = 0
  let nameCol = 0
  for (let c = 1; c <= metaCols; c++) {
    if (c === classCol) continue
    const v = probe[c - 1] ?? ''
    if (v === '') continue
    if (!idCol && /^\d{5,}$/.test(v)) idCol = c
    else if (!nameCol) nameCol = c
  }
  if (!nameCol) nameCol = classCol + 2 <= metaCols ? classCol + 2 : 0
  if (!idCol) idCol = classCol + 1 <= metaCols && classCol + 1 !== nameCol ? classCol + 1 : 0

  // 학생 행
  const students: Student[] = []
  const classSet = new Set<string>()
  let missingScore = 0
  let missingCr = 0
  for (let r = firstStudentRow; r <= grid.rows; r++) {
    const m = RE_CLASS_SEAT.exec(grid.text(r, classCol))
    if (!m) continue
    const classNo = String(Number(m[1]))
    const seatNo = Number(m[2])
    classSet.add(classNo)
    const responses = mcItems.map((it) => decodeResponse(grid.text(r, it.col), legend))
    let crScores: number[] | undefined
    if (crItems.length) {
      crScores = crItems.map((it) => {
        const v = grid.num(r, it.col)
        if (v == null) missingCr++
        return v ?? 0
      })
    }
    const mcCalc = mcItems.reduce((s, it, i) => s + (responses[i]!.k === 'correct' ? (it.points ?? 0) : 0), 0)
    const crCalc = crScores ? crScores.reduce((s, v) => s + v, 0) : 0
    const mc = mcScoreCol ? grid.num(r, mcScoreCol) : null
    const cr = crScoreCol ? grid.num(r, crScoreCol) : null
    const etc = etcScoreCol ? grid.num(r, etcScoreCol) : null
    const total = totalCol ? grid.num(r, totalCol) : null
    if (mc == null || total == null) missingScore++
    students.push({
      id: `${classNo}/${seatNo}`,
      classNo,
      seatNo,
      studentId: idCol ? grid.text(r, idCol) : '',
      name: nameCol ? grid.text(r, nameCol) : '',
      responses,
      crScores,
      neis: {
        mc: mc ?? mcCalc,
        cr: cr ?? crCalc,
        etc: etc ?? 0,
        total: total ?? mcCalc + crCalc + (etc ?? 0),
      },
    })
  }
  if (students.length === 0) throw new ParseError('no-students', `${fileName}: 학생 행을 찾지 못했습니다.`)
  if (missingScore) warnings.push({ level: 'info', code: 'student-score-recomputed', message: `${fileName}: 점수 칸이 비어 있는 학생 ${missingScore}명은 응답으로 점수를 계산했습니다.` })
  if (missingCr) warnings.push({ level: 'warn', code: 'cr-blank-cells', message: `${fileName}: 서답형 점수 칸 ${missingCr}개가 비어 있어 0점으로 처리했습니다.` })
  const classNos = [...classSet].sort((a, b) => Number(a) - Number(b))
  if (classNos.length > 1) warnings.push({ level: 'info', code: 'multi-class-file', message: `${fileName}: 한 파일에 ${classNos.length}개 반(${classNos.join(', ')}반)이 들어 있어 반별로 나눴습니다.` })
  if (header.classNo && classNos.length === 1 && header.classNo !== classNos[0]) {
    warnings.push({ level: 'warn', code: 'class-mismatch', message: `${fileName}: 제목의 반(${header.classNo}반)과 학생 행의 반(${classNos[0]}반)이 다릅니다. 학생 행 기준으로 처리합니다.` })
  }

  return { fileName, header, classNos, mcItems, crItems, maxima, students, legend, warnings }
}
