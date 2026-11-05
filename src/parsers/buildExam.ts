import type { ClassRoster, Exam, ExamHeader, GradeReference, Item, Standard, Student, Warning } from '../model/types'
import type { FileKind } from './detect'
import type { AnswerSheetParse } from './answerSheet'
import type { ItemInfoParse } from './itemInfo'
import type { AnswerKeyParse } from './answerKey'
import type { ItemAnalysisParse } from './itemAnalysis'
import { describeHeader } from './header'
import { neisCountsFor } from '../stats/neisTable'
import { isNoResponse } from '../stats/inclusion'

export interface ParsedFile {
  fileName: string
  kind: FileKind
  answers?: AnswerSheetParse
  itemInfo?: ItemInfoParse
  answerKey?: AnswerKeyParse
  itemAnalysis?: ItemAnalysisParse
  error?: string
}

export interface BuildResult {
  exam: Exam | null
  errors: Warning[]
  warnings: Warning[]
}

function sameKey(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

/** 비교용 정규화: 공백 제거, 앞의 "3학년" 같은 학년 표기 제거 */
export function normName(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, '').replace(/^\d학년/, '')
}

function groupKey(h: ExamHeader): string {
  return [h.year ?? '', h.semester ?? '', h.grade ?? '', normName(h.examName), normName(h.subject)].join('|')
}

/** 두 머리글이 모두 값이 있는 항목에서 서로 다른지 */
function headerConflicts(a: ExamHeader, b: ExamHeader | undefined): string[] {
  if (!b) return []
  const out: string[] = []
  const cmp = (label: string, x: string | undefined, y: string | undefined) => {
    if (x && y && x !== y) out.push(label)
  }
  cmp('교과목', normName(a.subject) || undefined, normName(b.subject) || undefined)
  cmp('고사', normName(a.examName) || undefined, normName(b.examName) || undefined)
  cmp('학기', a.semester, b.semester)
  cmp('학년도', a.year, b.year)
  return out
}

function keySignature(a: AnswerSheetParse): string {
  return a.mcItems.map((it) => `${it.no}:${(it.key?.key ?? []).join(',')}:${it.points ?? ''}`).join(';') + `|cr${a.crItems.length}`
}

type IaCheck = { status: 'verified' | 'mismatch' | 'unverifiable'; details: string[] }

/** 문항분석표의 반 수치를 같은 반 정오표로 계산한 값과 대조 */
function verifyItemAnalysis(ia: ItemAnalysisParse, mcItems: Item[], classes: ClassRoster[]): IaCheck {
  const cls = ia.classNo ? classes.find((c) => c.classNo === ia.classNo) : undefined
  if (!cls) return { status: 'unverifiable', details: [] }
  const tryWith = (students: Student[]): string[] => {
    const rows = neisCountsFor(mcItems, students)
    const diffs: string[] = []
    for (const ref of ia.items) {
      const r = rows.find((x) => x.no === ref.no)
      if (!r) {
        diffs.push(`${ref.no}번: 정오표에 없는 문항`)
        continue
      }
      const ours = [1, 2, 3, 4, 5].map((k) => r.counts[k as 1])
      const theirs = [1, 2, 3, 4, 5].map((k) => ref.classCounts[k as 1])
      if (ours.join(',') !== theirs.join(',') || r.blank !== ref.classBlank || r.multi !== ref.classMulti) {
        diffs.push(`${ref.no}번: 문항분석표 ${theirs.join('/')} · 정오표 ${ours.join('/')}`)
      }
    }
    if (ia.classN && ia.classN !== students.length) diffs.unshift(`학생 수: 문항분석표 ${ia.classN}명 · 정오표 ${students.length}명`)
    return diffs
  }
  const all = tryWith(cls.students)
  if (all.length === 0) return { status: 'verified', details: [] }
  const responded = cls.students.filter((s) => !isNoResponse(s))
  if (responded.length !== cls.students.length && tryWith(responded).length === 0) return { status: 'verified', details: [] }
  return { status: 'mismatch', details: all }
}

/** 파싱된 파일들을 하나의 Exam 으로 합친다. 정오표가 기준이며 다른 표는 보강·검증용. */
export function buildExam(files: ParsedFile[]): BuildResult {
  const errors: Warning[] = []
  const warnings: Warning[] = []
  for (const f of files) {
    if (f.error) errors.push({ level: 'error', code: 'file-error', message: `${f.fileName}: ${f.error}` })
    for (const p of [f.answers, f.itemInfo, f.answerKey, f.itemAnalysis]) if (p) warnings.push(...p.warnings)
  }
  const answers = files.filter((f) => f.answers).map((f) => f.answers!)
  if (answers.length === 0) {
    errors.push({ level: 'error', code: 'no-answers', message: '학생답 정오표가 없습니다. NEIS "교과목별 학생답 정오표" 엑셀 파일을 올려 주세요.' })
    return { exam: null, errors, warnings }
  }

  // 같은 시험인지 (제목 띄어쓰기 차이는 무시, 제목이 달라도 정답·배점이 모두 같으면 같은 시험으로 본다)
  const groups = new Map<string, AnswerSheetParse[]>()
  for (const a of answers) {
    const k = groupKey(a.header)
    groups.set(k, [...(groups.get(k) ?? []), a])
  }
  if (groups.size > 1) {
    const desc = [...groups.values()].map((g) => `${describeHeader(g[0]!.header) || '(제목 없음)'} ← ${g.map((x) => x.fileName).join(', ')}`)
    const sigs = new Set(answers.map(keySignature))
    if (sigs.size > 1) {
      errors.push({ level: 'error', code: 'mixed-exams', message: '서로 다른 시험(교과·고사)의 정오표가 섞여 있습니다. 한 시험의 파일만 남기고 나머지는 목록에서 빼 주세요.', details: desc })
      return { exam: null, errors, warnings }
    }
    warnings.push({ level: 'info', code: 'header-variants', message: '정오표마다 제목 표기가 조금 다르지만 정답·배점이 모두 같아 같은 시험으로 합쳤습니다.', details: desc })
  }

  // 문항 정의 일치 검증 (정오표 간)
  const ref = answers[0]!
  for (const a of answers.slice(1)) {
    const diffs: string[] = []
    if (a.mcItems.length !== ref.mcItems.length) diffs.push(`문항 수 ${ref.mcItems.length} vs ${a.mcItems.length}`)
    else {
      a.mcItems.forEach((it, i) => {
        const r = ref.mcItems[i]!
        if (it.no !== r.no) diffs.push(`${i + 1}번째 문항번호 ${r.no} vs ${it.no}`)
        else if (!sameKey(it.key?.key ?? [], r.key?.key ?? [])) diffs.push(`${it.no}번 정답 ${r.key?.key.join(',') ?? '?'} vs ${it.key?.key.join(',') ?? '?'}`)
        else if ((it.points ?? 0) !== (r.points ?? 0)) diffs.push(`${it.no}번 배점 ${r.points} vs ${it.points}`)
      })
    }
    if (a.crItems.length !== ref.crItems.length) diffs.push(`서답형 열 수 ${ref.crItems.length} vs ${a.crItems.length}`)
    if (diffs.length) errors.push({ level: 'error', code: 'key-mismatch', message: `${ref.fileName}와 ${a.fileName}의 정답·배점이 다릅니다. 같은 시험의 정오표인지 확인해 주세요.`, details: diffs })
  }
  if (errors.some((e) => e.code === 'key-mismatch')) return { exam: null, errors, warnings }

  // 문항
  const items: Item[] = ref.mcItems.map((it) => ({
    no: it.no,
    kind: 'mc',
    label: String(it.no),
    points: it.points ?? 0,
    key: it.key?.key ?? [],
    keyMode: it.key?.keyMode ?? 'single',
    standards: [],
  }))
  for (const c of ref.crItems) items.push({ no: c.no, kind: 'cr', label: c.label, points: c.points, key: [], keyMode: 'single', standards: [] })
  const mcItems = items.filter((i) => i.kind === 'mc')
  const crItems = items.filter((i) => i.kind === 'cr')

  // 학급 합치기: 학생(반/번호) 단위로 합친다. 같은 반이 여러 파일에 나뉘어 있어도(강의실별 등) 빠지지 않고,
  // 같은 학생이 두 번 나오면(같은 파일을 두 번 올린 경우) 나중 파일 것 하나만 남긴다.
  const byId = new Map<string, Student>()
  const classInfo = new Map<string, { header: ExamHeader; files: Set<string> }>()
  let dupCount = 0
  const dupFiles = new Set<string>()
  for (const a of answers) {
    for (const s of a.students) {
      if (byId.has(s.id)) {
        dupCount++
        dupFiles.add(a.fileName)
      }
      byId.set(s.id, s)
      const info = classInfo.get(s.classNo) ?? { header: a.header, files: new Set<string>() }
      info.files.add(a.fileName)
      classInfo.set(s.classNo, info)
    }
  }
  if (dupCount) {
    warnings.push({ level: 'warn', code: 'duplicate-students', message: `같은 학생(반/번호)이 두 번 이상 나옵니다(${dupCount}명). 같은 반 파일을 두 번 올린 것 같아 한 번만 셉니다.`, details: [...dupFiles] })
  }
  const classes: ClassRoster[] = [...classInfo.entries()]
    .map(([classNo, info]) => ({
      classNo,
      header: info.header,
      students: [...byId.values()].filter((s) => s.classNo === classNo).sort((x, y) => x.seatNo - y.seatNo),
      source: { fileName: [...info.files].join(', ') },
    }))
    .sort((x, y) => Number(x.classNo) - Number(y.classNo))
  const splitClasses = classes.filter((c) => (classInfo.get(c.classNo)?.files.size ?? 0) > 1 && c.students.length > 0)
  if (splitClasses.length && !dupCount) {
    warnings.push({ level: 'info', code: 'class-split-files', message: `여러 파일에 나뉘어 있던 반을 합쳤습니다: ${splitClasses.map((c) => `${c.classNo}반`).join(', ')}` })
  }
  const idSeen = new Map<string, string>()
  const dupIds: string[] = []
  for (const c of classes)
    for (const s of c.students) {
      if (!s.studentId) continue
      const prev = idSeen.get(s.studentId)
      if (prev && prev !== s.id) dupIds.push(`${s.studentId} (${prev}, ${s.id})`)
      idSeen.set(s.studentId, s.id)
    }
  if (dupIds.length) warnings.push({ level: 'warn', code: 'duplicate-student-id', message: `같은 학번이 서로 다른 반/번호에 나타납니다 (${dupIds.length}건).`, details: dupIds.slice(0, 10) })

  // 만점
  const mcSum = mcItems.reduce((s, i) => s + i.points, 0)
  const crSum = crItems.reduce((s, i) => s + i.points, 0)
  const maxima = {
    mc: ref.maxima.mc ?? mcSum,
    cr: ref.maxima.cr ?? crSum,
    etc: ref.maxima.etc ?? 0,
    bonus: 0,
    total: ref.maxima.total ?? (ref.maxima.mc ?? mcSum) + (ref.maxima.cr ?? crSum) + (ref.maxima.etc ?? 0),
  }
  if (Math.abs(maxima.mc - mcSum) > 0.005) warnings.push({ level: 'warn', code: 'mc-max-mismatch', message: `선택형 만점(${maxima.mc})과 문항 배점 합(${mcSum})이 다릅니다. 정오표의 배점 행을 확인해 주세요.` })
  if (crItems.length && Math.abs(maxima.cr - crSum) > 0.005) warnings.push({ level: 'warn', code: 'cr-max-mismatch', message: `서답형 만점(${maxima.cr})과 추가한 서답형 열의 배점 합(${crSum})이 다릅니다.` })
  if (!(maxima.total > 0)) errors.push({ level: 'error', code: 'no-max', message: '과목 만점을 알 수 없습니다(정오표 배점 행의 영역총점이 비어 있음).' })

  const examHeader: ExamHeader = { ...ref.header }
  delete examHeader.classNo

  // 문항정보표(정답·배점 양식) 보강
  const answerKey = files.find((f) => f.answerKey)?.answerKey
  if (answerKey) {
    const conflicts = headerConflicts(examHeader, answerKey.header).filter((x) => x === '교과목')
    if (conflicts.length) warnings.push({ level: 'warn', code: 'answerkey-subject', message: `문항정보표(${answerKey.fileName})의 교과목(${answerKey.header.subject})이 정오표(${examHeader.subject})와 다릅니다. 다른 과목 파일이 아닌지 확인해 주세요.` })
    const akMc = answerKey.items.filter((i) => i.kind === 'mc')
    const diffs: string[] = []
    if (akMc.length !== mcItems.length) diffs.push(`문항 수 정오표 ${mcItems.length} vs 문항정보표 ${akMc.length}`)
    for (const it of mcItems) {
      const ak = akMc.find((x) => x.no === it.no)
      if (!ak) continue
      if (ak.keyMode === 'any' && ak.key.length > 1) {
        it.key = ak.key
        it.keyMode = 'any'
      } else if (it.key.length && ak.key.length && !sameKey(it.key, ak.key)) diffs.push(`${it.no}번 정답 정오표 ${it.key.join(',')} vs 문항정보표 ${ak.key.join(',')}`)
      if (!it.key.length && ak.key.length) {
        it.key = ak.key
        it.keyMode = ak.keyMode
      }
      if (Math.abs(ak.points - it.points) > 0.005) diffs.push(`${it.no}번 배점 정오표 ${it.points} vs 문항정보표 ${ak.points}`)
    }
    if (diffs.length) warnings.push({ level: 'warn', code: 'answerkey-mismatch', message: `문항정보표(${answerKey.fileName})가 정오표와 다른 부분이 있습니다. 정오표 기준으로 분석합니다.`, details: diffs })
    if (answerKey.maxima.bonus) maxima.bonus = answerKey.maxima.bonus
  }

  // 문항정보표 보강 (성취기준·내용영역·난이도)
  const itemInfo = files.find((f) => f.itemInfo)?.itemInfo
  let standards: Standard[] = []
  if (itemInfo) {
    const conflicts = headerConflicts(examHeader, itemInfo.header).filter((x) => x === '교과목')
    if (conflicts.length) warnings.push({ level: 'warn', code: 'iteminfo-subject', message: `문항정보표(${itemInfo.fileName})의 교과목(${itemInfo.header.subject})이 정오표(${examHeader.subject})와 다릅니다. 다른 과목 파일이 아닌지 확인해 주세요.` })
    const iiMc = itemInfo.items.filter((i) => i.kind === 'mc')
    const diffs: string[] = []
    if (iiMc.length !== mcItems.length) diffs.push(`문항 수 정오표 ${mcItems.length} vs 문항정보표 ${iiMc.length}`)
    for (const it of mcItems) {
      const ii = iiMc.find((x) => x.no === it.no)
      if (!ii) continue
      if (it.key.length && ii.key.length && !sameKey(it.key, ii.key)) diffs.push(`${it.no}번 정답 정오표 ${it.key.join(',')} vs 문항정보표 ${ii.key.join(',')}`)
      if (Math.abs(ii.points - it.points) > 0.005) diffs.push(`${it.no}번 배점 정오표 ${it.points} vs 문항정보표 ${ii.points}`)
      it.difficulty = ii.difficulty
      it.domain = ii.domain
      it.standards = [...ii.standards]
      if (!it.key.length && ii.key.length) {
        it.key = ii.key
        it.keyMode = ii.keyMode
      }
    }
    const iiCr = itemInfo.items.filter((i) => i.kind === 'cr')
    crItems.forEach((it, idx) => {
      const ii = iiCr[idx]
      if (!ii) return
      it.difficulty = ii.difficulty
      it.domain = ii.domain
      it.standards = [...ii.standards]
    })
    if (diffs.length) warnings.push({ level: 'warn', code: 'iteminfo-mismatch', message: `문항정보표(${itemInfo.fileName})가 정오표와 다른 부분이 있습니다. 정오표 기준으로 분석합니다.`, details: diffs })
    // 성취기준: 실제로 분석되는 문항에 연결된 것만
    const used = new Set(items.flatMap((i) => i.standards))
    standards = itemInfo.standards.filter((s) => used.has(s.code)).map((s) => ({ ...s, itemNos: items.filter((i) => i.standards.includes(s.code)).map((i) => i.no) }))
    if (iiCr.length && crItems.length === 0) {
      warnings.push({ level: 'info', code: 'cr-totals-only', message: `문항정보표에 서답형 ${iiCr.length}문항이 있지만 정오표에는 서답형 총점만 있어 서답형은 총점으로만 분석합니다. 문항별 분석을 원하면 정오표에 "서답1, 서답2…" 열을 추가해 올려 주세요.` })
    }
    if (!examHeader.subject && itemInfo.header.subject) examHeader.subject = itemInfo.header.subject
  }

  // 문항분석표 (학년 전체 비교용): 반 수치를 같은 반 정오표와 대조해 같은 시험인지 확인한다.
  let gradeReference: GradeReference | undefined
  const iaFiles = files.filter((f) => f.itemAnalysis).map((f) => f.itemAnalysis!)
  const checked: { ia: ItemAnalysisParse; check: IaCheck; conflicts: string[] }[] = []
  for (const ia of iaFiles) {
    if (ia.items.length !== mcItems.length) {
      warnings.push({ level: 'warn', code: 'itemanalysis-mismatch', message: `문항분석표(${ia.fileName})의 문항 수(${ia.items.length})가 정오표(${mcItems.length})와 달라 학년 전체 비교에 쓰지 않습니다. 다른 시험의 문항분석표인지 확인해 주세요.` })
      continue
    }
    checked.push({ ia, check: verifyItemAnalysis(ia, mcItems, classes), conflicts: headerConflicts(examHeader, ia.header) })
  }
  const chosen = checked.find((c) => c.check.status === 'verified') ?? checked.find((c) => c.check.status === 'unverifiable' && c.conflicts.length === 0)
  for (const c of checked) {
    if (c === chosen) continue
    if (c.check.status === 'mismatch') {
      warnings.push({
        level: 'warn',
        code: 'itemanalysis-class-mismatch',
        message: `문항분석표(${c.ia.fileName})의 ${c.ia.classNo}반 수치가 ${c.ia.classNo}반 정오표와 다릅니다. 다른 시험의 문항분석표로 보여 학년 전체 비교에 쓰지 않았습니다.`,
        details: c.check.details.slice(0, 15),
      })
    } else if (c.conflicts.length) {
      warnings.push({ level: 'warn', code: 'itemanalysis-header', message: `문항분석표(${c.ia.fileName})의 ${c.conflicts.join('·')}이(가) 정오표와 달라 학년 전체 비교에 쓰지 않았습니다.` })
    }
  }
  if (chosen) {
    const ia = chosen.ia
    gradeReference = { source: ia.fileName, header: ia.header, classNo: ia.classNo, items: ia.items, verified: chosen.check.status === 'verified' ? true : undefined }
    if (chosen.check.status === 'verified') {
      warnings.push({ level: 'info', code: 'itemanalysis-verified', message: `문항분석표(${ia.classNo}반)의 반 수치가 ${ia.classNo}반 정오표와 ${ia.items.length}문항 모두 일치합니다. 학년 전체 ${ia.gradeN ?? '?'}명 수치를 비교에 사용합니다.` })
    } else {
      warnings.push({ level: 'info', code: 'itemanalysis-unverified', message: `문항분석표${ia.classNo ? `(${ia.classNo}반)` : ''}와 같은 반의 정오표가 없어 반 수치는 대조하지 못했습니다. 학년 전체 ${ia.gradeN ?? '?'}명 수치를 비교에 사용합니다.` })
    }
  }

  if (!examHeader.examName && (answerKey?.header.examName || itemInfo?.header.examName)) examHeader.examName = answerKey?.header.examName ?? itemInfo?.header.examName

  const exam: Exam = {
    header: examHeader,
    items,
    maxima,
    classes,
    standards,
    hasItemInfo: !!itemInfo && standards.length > 0,
    gradeReference,
    warnings,
    sources: files.map((f) => f.fileName),
  }
  if (errors.length) return { exam: null, errors, warnings }
  return { exam, errors, warnings }
}
