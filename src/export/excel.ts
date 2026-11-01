import type ExcelJSNS from 'exceljs'
import { CHOICES, LEVELS, type AnalysisResult, type Exam, type GroupStats, type ItemStats, type StandardStats } from '../model/types'
import type { Settings } from '../model/settings'
import { discBand } from '../model/thresholds'
import { describeHeader } from '../parsers/header'
import { neisCounts } from '../stats/neisTable'

type Cell = string | number | null | undefined
type Workbook = ExcelJSNS.Workbook
type Worksheet = ExcelJSNS.Worksheet

const HEAD_FILL: ExcelJSNS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF9' } }
const TOTAL_FILL: ExcelJSNS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F7' } }
const BORDER: Partial<ExcelJSNS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB9C2CF' } },
  bottom: { style: 'thin', color: { argb: 'FFB9C2CF' } },
  left: { style: 'thin', color: { argb: 'FFB9C2CF' } },
  right: { style: 'thin', color: { argb: 'FFB9C2CF' } },
}

interface TableSpec {
  /** 2단 헤더: group 이 같은 연속 열은 위 행에서 병합 */
  columns: { header: string; group?: string; width?: number; fmt?: string }[]
  rows: Cell[][]
  totalRowIdx?: number[]
}

function fmtOrNull(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : v
}

function addTitle(ws: Worksheet, title: string, meta: string, width: number): number {
  ws.mergeCells(1, 1, 1, Math.max(width, 2))
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 14 }
  ws.mergeCells(2, 1, 2, Math.max(width, 2))
  const m = ws.getCell(2, 1)
  m.value = meta
  m.font = { color: { argb: 'FF6B7280' } }
  return 4
}

function addTable(ws: Worksheet, startRow: number, spec: TableSpec, caption?: string): number {
  let r = startRow
  if (caption) {
    ws.getCell(r, 1).value = caption
    ws.getCell(r, 1).font = { bold: true, size: 12 }
    r += 1
  }
  const hasGroups = spec.columns.some((c) => c.group)
  if (hasGroups) {
    let c = 1
    while (c <= spec.columns.length) {
      const g = spec.columns[c - 1]!.group
      let end = c
      while (end + 1 <= spec.columns.length && spec.columns[end]!.group === g && g) end++
      if (g) {
        ws.mergeCells(r, c, r, end)
        const cell = ws.getCell(r, c)
        cell.value = g
        cell.font = { bold: true }
        cell.fill = HEAD_FILL
        cell.alignment = { horizontal: 'center' }
        for (let x = c; x <= end; x++) ws.getCell(r, x).border = BORDER
      } else {
        ws.mergeCells(r, c, r + 1, c)
        const cell = ws.getCell(r, c)
        cell.value = spec.columns[c - 1]!.header
        cell.font = { bold: true }
        cell.fill = HEAD_FILL
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = BORDER
        ws.getCell(r + 1, c).border = BORDER
      }
      c = end + 1
    }
    spec.columns.forEach((col, i) => {
      if (!col.group) return
      const cell = ws.getCell(r + 1, i + 1)
      cell.value = col.header
      cell.font = { bold: true }
      cell.fill = HEAD_FILL
      cell.alignment = { horizontal: 'center' }
      cell.border = BORDER
    })
    r += 2
  } else {
    spec.columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = col.header
      cell.font = { bold: true }
      cell.fill = HEAD_FILL
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = BORDER
    })
    r += 1
  }
  spec.rows.forEach((row, ri) => {
    row.forEach((v, i) => {
      const cell = ws.getCell(r + ri, i + 1)
      cell.value = v == null ? '-' : v
      cell.border = BORDER
      const fmt = spec.columns[i]?.fmt
      if (typeof v === 'number' && fmt) cell.numFmt = fmt
      if (typeof v === 'number') cell.alignment = { horizontal: 'right' }
      if (v == null) cell.alignment = { horizontal: 'center' }
      if (spec.totalRowIdx?.includes(ri)) {
        cell.font = { bold: true }
        cell.fill = TOTAL_FILL
      }
    })
  })
  spec.columns.forEach((col, i) => {
    const existing = ws.getColumn(i + 1).width ?? 0
    ws.getColumn(i + 1).width = Math.max(existing, col.width ?? 10)
  })
  return r + spec.rows.length + 1
}

function itemRows(stats: ItemStats[], exam: Exam, extra?: (s: ItemStats) => Cell[]): Cell[][] {
  const byNo = new Map(exam.items.map((i) => [i.no, i]))
  return stats.map((s) => {
    const it = byNo.get(s.no)
    return [...(extra ? extra(s) : []), s.no, s.key.join(',') || '-', s.points, it?.domain ?? '', it?.standards.join(' ') ?? '', s.expected ?? '', fmtOrNull(s.p), s.observed3 ?? '', fmtOrNull(s.disc), discBand(s.disc)?.label ?? '', ...CHOICES.map((c) => fmtOrNull(s.pct[c])), fmtOrNull(s.pct.none), s.flags.filter((f) => f.severity !== 'info').map((f) => f.label).join(', ')]
  })
}

const ITEM_COLS = (extra: { header: string; width?: number }[] = []) => [
  ...extra,
  { header: '문항', width: 6 },
  { header: '정답', width: 6 },
  { header: '배점', width: 6 },
  { header: '내용영역', width: 14 },
  { header: '성취기준', width: 14 },
  { header: '예상난이도', width: 10 },
  { header: '정답률(%)', width: 10, fmt: '0.0' },
  { header: '난이도 판정', width: 10 },
  { header: '변별도', width: 8, fmt: '0.00' },
  { header: '변별도 판정', width: 10 },
  ...CHOICES.map((c) => ({ header: String(c), group: '답지반응률(%)', width: 7, fmt: '0.0' })),
  { header: '무응답/중복', group: '답지반응률(%)', width: 10, fmt: '0.0' },
  { header: '확인 필요', width: 30 },
]

function standardRows(list: StandardStats[], result: AnalysisResult, kind: 'standard' | 'domain'): { columns: TableSpec['columns']; rows: Cell[][] } {
  const columns: TableSpec['columns'] = [
    ...(kind === 'standard' ? [{ header: '성취기준', width: 14 }, { header: '내용', width: 50 }, { header: '내용영역', width: 14 }] : [{ header: '내용영역', width: 18 }]),
    { header: '문항', width: 14 },
    { header: '문항 수', width: 7 },
    { header: '만점', width: 6 },
    { header: '평균', group: '원점수', width: 8, fmt: '0.0' },
    { header: '표준편차', group: '원점수', width: 8, fmt: '0.0' },
    { header: '평균', group: '100점 환산', width: 8, fmt: '0.0' },
    { header: '표준편차', group: '100점 환산', width: 8, fmt: '0.0' },
    { header: '전체', group: '성취율(%)', width: 8, fmt: '0.0' },
    ...LEVELS.map((l) => ({ header: l, group: '성취율(%)', width: 7, fmt: '0.0' })),
    ...result.classNos.map((c) => ({ header: `${c}반`, group: '학급별 성취율(%)', width: 7, fmt: '0.0' })),
  ]
  const rows: Cell[][] = list.map((s) => [
    ...(kind === 'standard' ? [s.code, s.text, s.domain ?? ''] : [s.code]),
    s.itemNos.join(', '),
    s.itemNos.length,
    s.maxPoints,
    fmtOrNull(s.overall.raw.mean),
    fmtOrNull(s.overall.raw.sd),
    fmtOrNull(s.overall.scaled.mean),
    fmtOrNull(s.overall.scaled.sd),
    fmtOrNull(s.overall.rate),
    ...LEVELS.map((l) => fmtOrNull(s.byLevel[l].rate)),
    ...result.classNos.map((c) => fmtOrNull(s.byClass[c]?.rate)),
  ])
  return { columns, rows }
}

export async function buildWorkbook(exam: Exam, result: AnalysisResult, settings: Settings): Promise<Workbook> {
  const mod = await import('exceljs')
  const ExcelJS = ((mod as unknown as { default?: typeof ExcelJSNS }).default ?? mod) as typeof ExcelJSNS
  const wb = new ExcelJS.Workbook()
  wb.creator = 'exam-analysis'
  wb.created = new Date()
  const meta = `${describeHeader(exam.header)} · ${result.classNos.length}개 반 ${result.overview.n}명 · 생성 ${new Date().toLocaleString('ko-KR')}`
  const o = result.overview
  const hasCr = exam.maxima.cr > 0

  // 1. 성취도분석
  {
    const ws = wb.addWorksheet('성취도분석')
    let r = addTitle(ws, '성취도분석표', meta, 9)
    r = addTable(ws, r, {
      columns: [{ header: '문항 수', width: 10 }, { header: '응답자 수', width: 10 }, { header: '검사신뢰도(α, 선다형)', width: 18, fmt: '0.000' }, { header: 'α(배점 가중)', width: 12, fmt: '0.000' }],
      rows: [[result.mcCount + result.crCount, o.n, fmtOrNull(o.alphaMc), fmtOrNull(o.alphaAll)]],
    })
    const g = (x: GroupStats) => [fmtOrNull(x.mc.mean), fmtOrNull(x.mc.sd), ...(hasCr ? [fmtOrNull(x.cr.mean), fmtOrNull(x.cr.sd)] : []), fmtOrNull(x.total.mean), fmtOrNull(x.total.sd)]
    r = addTable(
      ws,
      r,
      {
        columns: [
          { header: '구분', width: 10 },
          { header: '학생 수', width: 8 },
          { header: '비율(%)', width: 8, fmt: '0.0' },
          { header: '평균', group: `선다형(${exam.maxima.mc})`, width: 8, fmt: '0.0' },
          { header: '표준편차', group: `선다형(${exam.maxima.mc})`, width: 8, fmt: '0.0' },
          ...(hasCr
            ? [
                { header: '평균', group: `서답형(${exam.maxima.cr})`, width: 8, fmt: '0.0' },
                { header: '표준편차', group: `서답형(${exam.maxima.cr})`, width: 8, fmt: '0.0' },
              ]
            : []),
          { header: '평균', group: `전체(${exam.maxima.total})`, width: 8, fmt: '0.0' },
          { header: '표준편차', group: `전체(${exam.maxima.total})`, width: 8, fmt: '0.0' },
        ],
        rows: [['전체', o.n, 100, ...g(o)], ...LEVELS.map((l) => [l, result.byLevel[l].n, fmtOrNull(o.levelPct[l]), ...g(result.byLevel[l])])],
        totalRowIdx: [0],
      },
      '성취수준별 평균·표준편차',
    )
    addTable(
      ws,
      r,
      {
        columns: [{ header: '구분', width: 10 }, { header: '학생 수', width: 8 }, { header: '평균', width: 8, fmt: '0.0' }, { header: '표준편차', width: 8, fmt: '0.0' }, ...LEVELS.map((l) => ({ header: l, group: '성취수준별 비율(%)', width: 7, fmt: '0.0' })), ...LEVELS.map((l) => ({ header: l, group: '성취수준별 학생 수', width: 7 }))],
        rows: [
          ['전체', o.n, fmtOrNull(o.total.mean), fmtOrNull(o.total.sd), ...LEVELS.map((l) => fmtOrNull(o.levelPct[l])), ...LEVELS.map((l) => o.levelCounts[l])],
          ...result.classNos.map((c) => {
            const x = result.byClass[c]!
            return [`${c}반`, x.n, fmtOrNull(x.total.mean), fmtOrNull(x.total.sd), ...LEVELS.map((l) => fmtOrNull(x.levelPct[l])), ...LEVELS.map((l) => x.levelCounts[l])]
          }),
        ],
        totalRowIdx: [0],
      },
      '학급별 성취도',
    )
    ws.views = [{ state: 'frozen', ySplit: 3 }]
  }

  // 2. 문항별분석
  {
    const ws = wb.addWorksheet('문항별분석')
    const r = addTitle(ws, '문항별 정답률 및 답지반응 분포 (전체)', meta, 10)
    addTable(ws, r, { columns: ITEM_COLS(), rows: itemRows(result.items, exam) })
    ws.views = [{ state: 'frozen', ySplit: r + 1 }]
  }

  // 3. 문항별_성취수준별
  {
    const ws = wb.addWorksheet('문항별_성취수준별')
    const r = addTitle(ws, '문항별 정답률 및 답지반응 분포 (성취수준별)', meta, 10)
    const rows: Cell[][] = []
    for (const s of result.items) {
      rows.push(['전체', o.n, s.no, s.key.join(','), fmtOrNull(s.p), ...CHOICES.map((c) => fmtOrNull(s.pct[c])), fmtOrNull(s.pct.none)])
      for (const l of LEVELS) {
        const x = result.itemsByLevel[l].find((y) => y.no === s.no)!
        rows.push([l, x.n, s.no, s.key.join(','), x.n ? fmtOrNull(x.p) : null, ...CHOICES.map((c) => (x.n ? fmtOrNull(x.pct[c]) : null)), x.n ? fmtOrNull(x.pct.none) : null])
      }
    }
    addTable(ws, r, {
      columns: [{ header: '성취수준', width: 9 }, { header: '학생 수', width: 8 }, { header: '문항', width: 6 }, { header: '정답', width: 6 }, { header: '정답률(%)', width: 10, fmt: '0.0' }, ...CHOICES.map((c) => ({ header: String(c), group: '답지반응률(%)', width: 7, fmt: '0.0' })), { header: '무응답/중복', group: '답지반응률(%)', width: 10, fmt: '0.0' }],
      rows,
    })
    ws.autoFilter = { from: { row: r + 2, column: 1 }, to: { row: r + 1 + rows.length, column: 11 } }
  }

  // 4. 성취수준별_상하위
  {
    const ws = wb.addWorksheet('성취수준별_상하위')
    const r = addTitle(ws, '성취수준별 정답률 상위·하위 3문항', meta, 6)
    const rows: Cell[][] = []
    for (const l of ['all', ...LEVELS] as const) {
      const stats = l === 'all' ? result.items : result.itemsByLevel[l]
      const n = l === 'all' ? o.n : result.byLevel[l].n
      const tb = result.topBottom[l]
      tb.top.forEach((no, i) => rows.push([l === 'all' ? '전체' : l, n, '정답률 높은 문항', i + 1, no, stats.find((s) => s.no === no)?.key.join(',') ?? '', fmtOrNull(stats.find((s) => s.no === no)?.p)]))
      tb.bottom.forEach((no, i) => rows.push([l === 'all' ? '전체' : l, n, '정답률 낮은 문항', i + 1, no, stats.find((s) => s.no === no)?.key.join(',') ?? '', fmtOrNull(stats.find((s) => s.no === no)?.p)]))
    }
    addTable(ws, r, { columns: [{ header: '집단', width: 8 }, { header: '학생 수', width: 8 }, { header: '구분', width: 16 }, { header: '순위', width: 6 }, { header: '문항', width: 6 }, { header: '정답', width: 6 }, { header: '정답률(%)', width: 10, fmt: '0.0' }], rows })
  }

  // 5. 학급별_문항분석
  {
    const ws = wb.addWorksheet('학급별_문항분석')
    const r = addTitle(ws, '학급별 문항 분석', meta, 10)
    const rows: Cell[][] = []
    for (const c of result.classNos) rows.push(...itemRows(result.itemsByClass[c]!, exam, () => [`${c}반`, result.byClass[c]!.n]))
    addTable(ws, r, { columns: ITEM_COLS([{ header: '학급', width: 7 }, { header: '학생 수', width: 8 }]), rows })
    ws.autoFilter = { from: { row: r + 2, column: 1 }, to: { row: r + 1 + rows.length, column: 5 } }
  }

  // 6. 문항분석표_재구성 (NEIS 양식)
  {
    const ws = wb.addWorksheet('문항분석표_재구성')
    const useRef = !!exam.gradeReference && !settings.uploadedIsWholeGrade
    const allStudents = exam.classes.flatMap((c) => c.students)
    const gradeLabel = useRef ? `학년 전체 (문항분석표 ${exam.gradeReference!.items[0]?.gradeN ?? '?'}명)` : `올린 반 합계 (${allStudents.length}명)`
    let r = addTitle(ws, '문항분석표 (NEIS 양식 재구성)', `${meta} · 괄호 안 = ${gradeLabel}`, 12)
    const all = neisCounts(exam, allStudents)
    for (const cls of exam.classes) {
      const own = neisCounts(exam, cls.students)
      const rows: Cell[][] = own.map((x, i) => {
        const ref = useRef ? exam.gradeReference!.items.find((y) => y.no === x.no) : undefined
        const g = all[i]!
        const gc = ref ? ref.gradeCounts : { ...g.counts, none: g.blank + g.multi }
        return [x.no, ...CHOICES.map((c) => `${x.counts[c]}(${gc[c]})`), x.sum, x.key.join(','), `${x.p == null ? '-' : x.p.toFixed(2)}(${ref ? (ref.gradeP == null ? '-' : ref.gradeP.toFixed(2)) : g.p == null ? '-' : g.p.toFixed(2)})`, ref ? `${x.blank}(${ref.gradeCounts.none})` : `${x.blank}(${g.blank})`, ref ? `${x.multi}(-)` : `${x.multi}(${g.multi})`]
      })
      r = addTable(ws, r, { columns: [{ header: '문항번호', width: 9 }, ...CHOICES.map((c) => ({ header: `${c}번`, group: '답안번호', width: 10 })), { header: '합계', width: 7 }, { header: '정답', width: 6 }, { header: '정답률(%)', width: 16 }, { header: '무표기', width: 9 }, { header: '중복표기', width: 9 }], rows }, `${cls.classNo}반 (${cls.students.length}명)`)
    }
  }

  // 7·8. 평가영역별 / 성취기준별
  if (exam.hasItemInfo && result.standards.length > 0) {
    const ws = wb.addWorksheet('평가영역별')
    const r = addTitle(ws, '내용영역별 분석 결과', meta, 12)
    const d = standardRows(result.domains, result, 'domain')
    addTable(ws, r, { columns: d.columns, rows: d.rows })
    const ws2 = wb.addWorksheet('성취기준별')
    const r2 = addTitle(ws2, '성취기준별 성취율', meta, 12)
    const s = standardRows(result.standards, result, 'standard')
    addTable(ws2, r2, { columns: s.columns, rows: s.rows })
  }

  // 9. 서답형
  if (result.constructed.length > 0) {
    const ws = wb.addWorksheet('서답형')
    let r = addTitle(ws, '서답형 문항 분석', meta, 10)
    for (const it of result.constructed) {
      r = addTable(
        ws,
        r,
        {
          columns: [{ header: '성취수준', width: 9 }, { header: '학생 수', width: 8 }, { header: '평균', width: 8, fmt: '0.0' }, { header: '표준편차', width: 8, fmt: '0.0' }, { header: '100점 환산', width: 10, fmt: '0.0' }, ...it.values.map((v) => ({ header: `${v}점`, group: '점수별 학생 비율(%)', width: 7, fmt: '0.0' }))],
          rows: [...LEVELS.map((l) => [l, it.byLevel[l].n, fmtOrNull(it.byLevel[l].mean), fmtOrNull(it.byLevel[l].sd), fmtOrNull(it.byLevel[l].pct), ...it.values.map((v) => (it.byLevel[l].n ? fmtOrNull(it.byLevel[l].dist[String(v)]) : null))]), ['전체', it.overall.n, fmtOrNull(it.overall.mean), fmtOrNull(it.overall.sd), fmtOrNull(it.overall.pct), ...it.values.map((v) => fmtOrNull(it.overall.dist[String(v)]))]],
          totalRowIdx: [LEVELS.length],
        },
        `${it.label} (배점 ${it.points})`,
      )
    }
  }

  // 10. 학생별
  {
    const ws = wb.addWorksheet('학생별')
    const r = addTitle(ws, '학생별 결과', meta, 10)
    const mc = exam.items.filter((i) => i.kind === 'mc')
    const rows: Cell[][] = result.students.map((s) => [
      Number(s.student.classNo),
      s.student.seatNo,
      s.student.studentId,
      s.student.name,
      s.mcScore,
      ...(hasCr ? [s.crScore] : []),
      s.total,
      fmtOrNull(s.pct),
      s.level,
      s.wrongItems.length,
      ...mc.map((_, i) => {
        const x = s.student.responses[i]
        if (!x) return ''
        return x.k === 'correct' ? 'O' : x.k === 'wrong' ? String(x.choice) : x.k === 'blank' ? '-' : x.k === 'multi' ? `복수(${x.choices.join(',')})` : x.raw
      }),
    ])
    addTable(ws, r, {
      columns: [{ header: '반', width: 5 }, { header: '번호', width: 6 }, { header: '학번', width: 12 }, { header: '이름', width: 10 }, { header: `선다형(${exam.maxima.mc})`, width: 10 }, ...(hasCr ? [{ header: `서답형(${exam.maxima.cr})`, width: 10 }] : []), { header: `총점(${exam.maxima.total})`, width: 9 }, { header: '성취율(%)', width: 9, fmt: '0.0' }, { header: '성취수준', width: 8 }, { header: '틀린 문항 수', width: 10 }, ...mc.map((it) => ({ header: String(it.no), group: '문항별 응답 (O=정답, 숫자=선택한 오답, -=무표기)', width: 5 }))],
      rows,
    })
    ws.views = [{ state: 'frozen', xSplit: 4, ySplit: r + 1 }]
  }

  // 11. 설정
  {
    const ws = wb.addWorksheet('설정')
    const r = addTitle(ws, '분석 설정', meta, 4)
    addTable(ws, r, {
      columns: [{ header: '항목', width: 24 }, { header: '값', width: 60 }],
      rows: [
        ['분할점수 (% 이상)', `A ${settings.cutoffs.AB} / B ${settings.cutoffs.BC} / C ${settings.cutoffs.CD} / D ${settings.cutoffs.DE}`],
        ['성취수준 산출 기준', settings.levelBasis === 'subjectMax' ? `과목 만점 (${exam.maxima.total})` : `선다형 만점 (${exam.maxima.mc})`],
        ['표준편차', settings.sdMode === 'population' ? '모집단 (÷N)' : '표본 (÷(N−1))'],
        ['총점 출처', settings.scoreSource === 'neis' ? 'NEIS 영역총점' : '응답으로 재계산'],
        ['변별도', '문항 점수와 (총점 − 문항 점수)의 피어슨 상관'],
        ['신뢰도', '선다형 0/1 KR-20 (Cronbach α)'],
        ['답지반응률', '무표기·복수표기·무효는 "무응답/중복"으로 합산 (문항분석표_재구성 시트는 NEIS 방식)'],
        ['입력 파일', exam.sources.join(', ')],
        ['생성', new Date().toLocaleString('ko-KR')],
      ],
    })
  }
  return wb
}

export function exportFileName(exam: Exam): string {
  const h = exam.header
  const parts = ['성취평가분석', h.year ? `${h.year}학년도` : '', h.grade ? `${h.grade}학년` : '', h.semester ? `${h.semester}학기` : '', h.examName ?? '', h.subject ?? ''].filter(Boolean)
  return parts.join('_').replace(/[\\/:*?"<>|]/g, '') + '.xlsx'
}

export async function exportExcel(exam: Exam, result: AnalysisResult, settings: Settings): Promise<void> {
  const wb = await buildWorkbook(exam, result, settings)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(exam)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
