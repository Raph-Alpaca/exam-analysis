import type { ClassRoster, Exam, ExamHeader, Item, Standard, Student, Warning } from '../model/types'
import type { FileKind } from './detect'
import type { AnswerSheetParse } from './answerSheet'
import type { ItemInfoParse } from './itemInfo'
import type { AnswerKeyParse } from './answerKey'
import type { ItemAnalysisParse } from './itemAnalysis'

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

function groupKey(h: ExamHeader): string {
  return [h.year ?? '', h.semester ?? '', h.grade ?? '', h.examName ?? '', h.subject ?? ''].join('|')
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

  // 같은 시험인지
  const groups = new Map<string, AnswerSheetParse[]>()
  for (const a of answers) {
    const k = groupKey(a.header)
    groups.set(k, [...(groups.get(k) ?? []), a])
  }
  if (groups.size > 1) {
    const desc = [...groups.values()].map((g) => `${g[0]!.header.raw || '(제목 없음)'} ← ${g.map((x) => x.fileName).join(', ')}`)
    errors.push({ level: 'error', code: 'mixed-exams', message: '서로 다른 시험의 정오표가 섞여 있습니다. 한 시험의 파일만 남겨 주세요.', details: desc })
    return { exam: null, errors, warnings }
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

  // 학급 합치기
  const classMap = new Map<string, ClassRoster>()
  const idSeen = new Map<string, string>()
  for (const a of answers) {
    const byClass = new Map<string, Student[]>()
    for (const s of a.students) byClass.set(s.classNo, [...(byClass.get(s.classNo) ?? []), s])
    for (const [classNo, students] of byClass) {
      if (classMap.has(classNo)) {
        warnings.push({ level: 'warn', code: 'duplicate-class', message: `${classNo}반 정오표가 두 번 올라와 나중 파일(${a.fileName})로 바꿨습니다.` })
      }
      classMap.set(classNo, { classNo, header: a.header, students, source: { fileName: a.fileName } })
    }
  }
  const classes = [...classMap.values()].sort((x, y) => Number(x.classNo) - Number(y.classNo))
  const dupIds: string[] = []
  for (const c of classes)
    for (const s of c.students) {
      if (!s.studentId) continue
      const prev = idSeen.get(s.studentId)
      if (prev && prev !== s.id) dupIds.push(`${s.studentId} (${prev}, ${s.id})`)
      idSeen.set(s.studentId, s.id)
    }
  if (dupIds.length) warnings.push({ level: 'warn', code: 'duplicate-student-id', message: `같은 학번이 여러 번 나타납니다 (${dupIds.length}건).`, details: dupIds.slice(0, 10) })

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

  // 정답/배점표 보강
  const answerKey = files.find((f) => f.answerKey)?.answerKey
  if (answerKey) {
    const akMc = answerKey.items.filter((i) => i.kind === 'mc')
    const diffs: string[] = []
    if (akMc.length !== mcItems.length) diffs.push(`문항 수 정오표 ${mcItems.length} vs 정답배점표 ${akMc.length}`)
    for (const it of mcItems) {
      const ak = akMc.find((x) => x.no === it.no)
      if (!ak) continue
      if (ak.keyMode === 'any' && ak.key.length > 1) {
        it.key = ak.key
        it.keyMode = 'any'
      } else if (it.key.length && ak.key.length && !sameKey(it.key, ak.key)) diffs.push(`${it.no}번 정답 정오표 ${it.key.join(',')} vs 정답배점표 ${ak.key.join(',')}`)
      if (!it.key.length && ak.key.length) {
        it.key = ak.key
        it.keyMode = ak.keyMode
      }
      if (Math.abs(ak.points - it.points) > 0.005) diffs.push(`${it.no}번 배점 정오표 ${it.points} vs 정답배점표 ${ak.points}`)
    }
    if (diffs.length) warnings.push({ level: 'warn', code: 'answerkey-mismatch', message: `정답/배점표(${answerKey.fileName})가 정오표와 다른 부분이 있습니다. 정오표 기준으로 분석합니다.`, details: diffs })
    if (answerKey.maxima.bonus) maxima.bonus = answerKey.maxima.bonus
  }

  // 문항정보표 보강 (성취기준·내용영역·난이도)
  const itemInfo = files.find((f) => f.itemInfo)?.itemInfo
  let standards: Standard[] = []
  if (itemInfo) {
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
    // 성취기준: 정오표에 실제로 있는 문항만 연결
    const present = new Set(items.map((i) => `${i.kind}:${i.no}`))
    standards = itemInfo.standards
      .map((s) => ({
        ...s,
        itemNos: s.itemNos.filter((n, i, arr) => arr.indexOf(n) === i && (present.has(`mc:${n}`) || present.has(`cr:${n}`))),
      }))
      .filter((s) => s.itemNos.length > 0)
    if (iiCr.length && crItems.length === 0) {
      warnings.push({ level: 'info', code: 'cr-totals-only', message: `문항정보표에 서답형 ${iiCr.length}문항이 있지만 정오표에는 서답형 총점만 있어 서답형은 총점으로만 분석합니다. 문항별 분석을 원하면 정오표에 "서답1, 서답2…" 열을 추가해 올려 주세요.` })
    }
  }

  // 문항분석표 (학년 전체 비교용)
  const itemAnalysis = files.find((f) => f.itemAnalysis)?.itemAnalysis
  let gradeReference: Exam['gradeReference']
  if (itemAnalysis) {
    if (itemAnalysis.items.length !== mcItems.length) {
      warnings.push({ level: 'warn', code: 'itemanalysis-mismatch', message: `문항분석표(${itemAnalysis.fileName})의 문항 수(${itemAnalysis.items.length})가 정오표(${mcItems.length})와 달라 학년 전체 비교에 쓰지 않습니다.` })
    } else {
      gradeReference = { source: itemAnalysis.fileName, header: itemAnalysis.header, items: itemAnalysis.items }
    }
  }

  const header: ExamHeader = { ...ref.header }
  delete header.classNo
  if (!header.subject && itemInfo?.header.subject) header.subject = itemInfo.header.subject
  if (!header.examName && (answerKey?.header.examName || itemInfo?.header.examName)) header.examName = answerKey?.header.examName ?? itemInfo?.header.examName

  const exam: Exam = {
    header,
    items,
    maxima,
    classes,
    standards,
    hasItemInfo: !!itemInfo && standards.length > 0,
    gradeReference,
    warnings,
    sources: files.map((f) => f.fileName),
  }
  return { exam, errors, warnings }
}
