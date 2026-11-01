import { useMemo, useState } from 'react'
import { CHOICES, LEVELS, type AnalysisResult, type Exam, type GroupStats } from '../../../model/types'
import { useAppStore } from '../../store/useAppStore'
import { useFullAnalysis } from '../../store/useAnalysis'
import { fmt1, fmtInt } from '../../../model/format'
import { heatStyle, LEVEL_COLORS } from '../../theme/levels'
import { LevelLegend, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { LevelStackedBar } from '../../charts/charts'
import { neisCounts } from '../../../stats/neisTable'

type ClassRow = { name: string; g: GroupStats }

export function ClassStatsTable({ result, caption }: { result: AnalysisResult; caption?: string }) {
  const rows: ClassRow[] = result.classNos.map((c) => ({ name: `${c}반`, g: result.byClass[c]! }))
  const footer: ClassRow[] = [{ name: '전체', g: result.overview }]
  const cols: Column<ClassRow>[] = [
    { id: 'name', header: '학급', accessor: (r) => r.name, align: 'center', sortable: true },
    { id: 'n', header: '학생 수', accessor: (r) => r.g.n, cell: (r) => fmtInt(r.g.n), sortable: true },
    { id: 'mean', header: '평균', accessor: (r) => r.g.total.mean, cell: (r) => fmt1(r.g.total.mean), sortable: true },
    { id: 'sd', header: '표준편차', accessor: (r) => r.g.total.sd, cell: (r) => fmt1(r.g.total.sd), sortable: true },
    ...LEVELS.map(
      (l): Column<ClassRow> => ({
        id: `l${l}`,
        header: l,
        group: '성취수준별 비율(%) · 학생 수',
        accessor: (r) => r.g.levelPct[l],
        cell: (r) => (
          <span>
            {fmt1(r.g.levelPct[l])} <span className="muted small">({r.g.levelCounts[l]})</span>
          </span>
        ),
        cellStyle: () => ({ borderLeft: `4px solid ${LEVEL_COLORS[l]}` }),
        sortable: true,
      }),
    ),
  ]
  return <DataTable columns={cols} rows={rows} footerRows={footer} rowKey={(r) => r.name} caption={caption} compact />
}

/** 학년 전체 기준의 출처 */
export function useGradeReference(exam: Exam) {
  const settings = useAppStore((s) => s.settings)
  const full = useFullAnalysis()
  const useRef = !!exam.gradeReference && !settings.uploadedIsWholeGrade
  const label = useRef ? `학년 전체 (문항분석표, ${exam.gradeReference!.items[0]?.gradeN ?? '?'}명)` : settings.uploadedIsWholeGrade ? `학년 전체 (올린 반 합계, ${full?.overview.n ?? 0}명)` : `올린 반 합계 (${full?.overview.n ?? 0}명)`
  const pOf = (no: number): number | null => {
    if (useRef) return exam.gradeReference!.items.find((i) => i.no === no)?.gradeP ?? null
    return full?.items.find((i) => i.no === no)?.p ?? null
  }
  return { useRef, label, pOf, full }
}

export function ItemByClassTable({ exam, result, caption }: { exam: Exam; result: AnalysisResult; caption?: string }) {
  const grade = useGradeReference(exam)
  type Row = { no: number; all: number | null; byClass: Record<string, number | null>; grade: number | null }
  const rows: Row[] = result.items.map((it) => ({
    no: it.no,
    all: it.p,
    byClass: Object.fromEntries(result.classNos.map((c) => [c, result.itemsByClass[c]!.find((x) => x.no === it.no)?.p ?? null])),
    grade: grade.pOf(it.no),
  }))
  const cols: Column<Row>[] = [
    { id: 'no', header: '문항', accessor: (r) => r.no, align: 'center', sortable: true },
    ...result.classNos.map(
      (c): Column<Row> => ({ id: `c${c}`, header: `${c}반`, accessor: (r) => r.byClass[c] ?? null, cell: (r) => fmt1(r.byClass[c]), cellStyle: (r) => heatStyle(r.byClass[c]), sortable: true }),
    ),
    { id: 'all', header: result.classNos.length > 1 ? '선택 반 전체' : '전체', accessor: (r) => r.all, cell: (r) => fmt1(r.all), cellStyle: (r) => heatStyle(r.all), sortable: true },
    { id: 'grade', header: grade.label, accessor: (r) => r.grade, cell: (r) => fmt1(r.grade), cellStyle: (r) => heatStyle(r.grade), sortable: true },
  ]
  return <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.no)} caption={caption ?? '문항별 정답률(%) — 진할수록 높음'} compact />
}

export function NeisItemTable({ exam, classNo }: { exam: Exam; classNo: string }) {
  const settings = useAppStore((s) => s.settings)
  const cls = exam.classes.find((c) => c.classNo === classNo)
  const useRef = !!exam.gradeReference && !settings.uploadedIsWholeGrade
  const rows = useMemo(() => {
    if (!cls) return []
    const own = neisCounts(exam, cls.students)
    const all = neisCounts(
      exam,
      exam.classes.flatMap((c) => c.students),
    )
    return own.map((r, i) => {
      const ref = useRef ? exam.gradeReference!.items.find((x) => x.no === r.no) : undefined
      const g = all[i]!
      const gradeCounts = ref ? ref.gradeCounts : { ...g.counts, none: g.blank + g.multi }
      return {
        no: r.no,
        key: r.key,
        cells: CHOICES.map((c) => `${r.counts[c]}(${gradeCounts[c]})`),
        sum: r.sum,
        p: `${r.p == null ? '-' : r.p.toFixed(2)}(${ref ? (ref.gradeP == null ? '-' : ref.gradeP.toFixed(2)) : g.p == null ? '-' : g.p.toFixed(2)})`,
        blank: ref ? `${r.blank}(${ref.gradeCounts.none})` : `${r.blank}(${g.blank})`,
        multi: ref ? `${r.multi}(—)` : `${r.multi}(${g.multi})`,
      }
    })
  }, [exam, cls, useRef])
  type Row = (typeof rows)[number]
  const cols: Column<Row>[] = [
    { id: 'no', header: '문항번호', accessor: (r) => r.no, align: 'center' },
    ...CHOICES.map((c, i): Column<Row> => ({ id: `c${c}`, header: `${c}번`, group: '답안번호 (반 인원 / 괄호 안: 전체)', cell: (r) => r.cells[i], align: 'center', cellClass: (r) => (r.key.includes(c) ? 'key' : undefined) })),
    { id: 'sum', header: '합계', accessor: (r) => r.sum, align: 'center' },
    { id: 'key', header: '정답', cell: (r) => r.key.join(','), align: 'center' },
    { id: 'p', header: '정답률(%)', cell: (r) => r.p, align: 'center' },
    { id: 'blank', header: '무표기', cell: (r) => r.blank, align: 'center' },
    { id: 'multi', header: '중복표기', cell: (r) => r.multi, align: 'center' },
  ]
  if (!cls) return null
  const gradeLabel = useRef ? `학년 전체 ${exam.gradeReference!.items[0]?.gradeN ?? '?'}명 (문항분석표)` : `올린 반 합계 ${exam.classes.reduce((a, c) => a + c.students.length, 0)}명`
  return (
    <DataTable columns={cols} rows={rows} rowKey={(r) => String(r.no)} caption={`${classNo}반 문항분석표 (NEIS 양식 재구성) · 괄호 안: ${gradeLabel}${useRef ? ' · 중복표기 전체값은 문항분석표의 무표기와 합산되어 무표기 칸에 표시' : ''}`} compact />
  )
}

export function ClassCompareTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const [neisClass, setNeisClass] = useState(result.classNos[0] ?? exam.classes[0]?.classNo ?? '')
  const groups = result.classNos.map((c) => ({ name: `${c}반`, stats: result.byClass[c]! }))
  return (
    <div className="stack">
      <div className="grid grid-2">
        <section className="card">
          <SectionTitle title="학급별 성취도" />
          <ClassStatsTable result={result} />
        </section>
        <section className="card">
          <SectionTitle title="학급별 성취수준 비율" />
          <LevelStackedBar groups={groups} height={Math.max(160, 60 + groups.length * 34)} />
          <LevelLegend />
        </section>
      </div>
      <section className="card">
        <SectionTitle title="문항 × 학급 정답률">반마다 유독 낮은 문항을 찾습니다. 마지막 열은 학년 전체 기준(문항분석표가 있으면 그 값, 없으면 올린 반 합계).</SectionTitle>
        <ItemByClassTable exam={exam} result={result} />
      </section>
      <section className="card">
        <SectionTitle
          title="문항분석표 재구성 (NEIS 양식)"
          right={
            <label className="row small">
              반 선택
              <select value={neisClass} onChange={(e) => setNeisClass(e.target.value)}>
                {exam.classes.map((c) => (
                  <option key={c.classNo} value={c.classNo}>
                    {c.classNo}반
                  </option>
                ))}
              </select>
            </label>
          }
        >
          NEIS에서 아직 문항분석표를 받을 수 없을 때 대신 쓸 수 있습니다. NEIS와 같이 복수표기는 표기한 답지마다 세고 "중복표기"에도 셉니다.
        </SectionTitle>
        <NeisItemTable exam={exam} classNo={neisClass} />
      </section>
    </div>
  )
}
