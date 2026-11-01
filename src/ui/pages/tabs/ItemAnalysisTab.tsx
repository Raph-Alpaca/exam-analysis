import { CHOICES, type AnalysisResult, type Exam, type ItemStats } from '../../../model/types'
import { useAppStore } from '../../store/useAppStore'
import { alphaBand, discBand } from '../../../model/thresholds'
import { fmt1, fmt2, fmt3, fmtPoints } from '../../../model/format'
import { pShadeClass } from '../../theme/levels'
import { Badge, BandBadge, InlineBar, KpiTile, SectionTitle } from '../../components/basic'
import { DataTable, type Column } from '../../components/DataTable'
import { ItemAccuracyBar } from '../../charts/charts'
import { ItemDetailDrawer } from './ItemDetailDrawer'

export function itemColumns(exam: Exam, opts: { compact?: boolean } = {}): Column<ItemStats>[] {
  const byNo = new Map(exam.items.filter((i) => i.kind === 'mc').map((i) => [i.no, i]))
  const hasInfo = exam.hasItemInfo
  const hasDomain = exam.items.some((i) => i.domain)
  const cols: Column<ItemStats>[] = [
    { id: 'no', header: '문항', accessor: (r) => r.no, align: 'center', sortable: true, width: 52 },
    { id: 'key', header: '정답', cell: (r) => r.key.join(',') || '-', align: 'center', width: 48 },
    { id: 'pts', header: '배점', accessor: (r) => r.points, cell: (r) => fmtPoints(r.points), width: 48 },
  ]
  if (hasDomain && !opts.compact) cols.push({ id: 'domain', header: '내용영역', accessor: (r) => byNo.get(r.no)?.domain ?? '', cell: (r) => <span className="small">{byNo.get(r.no)?.domain ?? ''}</span>, width: 110, sortable: true })
  if (hasInfo) cols.push({ id: 'exp', header: '예상난이도', accessor: (r) => r.expected ?? '', align: 'center', sortable: true })
  cols.push(
    { id: 'p', header: '정답률(%)', accessor: (r) => r.p, cell: (r) => <strong>{fmt1(r.p)}</strong>, cellClass: (r) => pShadeClass(r.p), sortable: true },
    { id: 'obs', header: '난이도 판정', accessor: (r) => r.observed3 ?? '', align: 'center', headerTitle: '정답률 75% 이상 쉬움, 25~75% 보통, 25% 미만 어려움 (Cangelosi)' },
    {
      id: 'disc',
      header: '변별도',
      accessor: (r) => r.disc,
      cell: (r) =>
        opts.compact ? (
          fmt2(r.disc)
        ) : (
          <span className="nowrap">
            {fmt2(r.disc)} <BandBadge band={discBand(r.disc)} />
          </span>
        ),
      sortable: true,
      headerTitle: '문항 점수와 (총점 − 문항 점수)의 상관. .40 이상 높음, .20 미만 낮음',
    },
    ...CHOICES.map(
      (c): Column<ItemStats> => ({
        id: `o${c}`,
        header: String(c),
        group: '답지반응률(%)',
        accessor: (r) => r.pct[c],
        cell: (r) => (opts.compact ? fmt1(r.pct[c]) : <InlineBar value={r.pct[c]} isKey={r.key.includes(c)} />),
        cellClass: (r) => (r.key.includes(c) ? 'key dense' : 'dense'),
      }),
    ),
    { id: 'none', header: '무응답·중복', group: '답지반응률(%)', accessor: (r) => r.pct.none, cell: (r) => (opts.compact ? fmt1(r.pct.none) : <InlineBar value={r.pct.none} />), cellClass: () => 'dense' },
  )
  cols.push({
    id: 'flags',
    header: '확인 필요',
    cell: (r) =>
      opts.compact ? (
        <span className="small">{r.flags.filter((f) => f.severity !== 'info').map((f) => f.label).join(', ')}</span>
      ) : (
        <span className="row" style={{ gap: 4 }}>
          {r.flags.map((f) => (
            <Badge key={f.code} tone={f.severity === 'danger' ? 'danger' : f.severity === 'warn' ? 'warn' : 'neutral'}>
              {f.label}
            </Badge>
          ))}
        </span>
      ),
    accessor: (r) => r.flags.length,
    sortable: true,
  })
  return cols
}

export function ThresholdHelp() {
  return (
    <details className="help" style={{ marginTop: 8 }}>
      <summary>지표 해석 기준 (교육부·KICE)</summary>
      <div className="small muted stack-sm" style={{ marginTop: 6 }}>
        <div>
          <strong>정답률(난이도)</strong>: 75% 이상 쉬움 · 25~75% 보통 · 25% 미만 어려움 (3단계, Cangelosi 1990). 문항정보표의 예상난이도와 다르면 플래그.
        </div>
        <div>
          <strong>변별도</strong>: 문항 점수와 (총점 − 문항 점수)의 상관. .10 미만 없음 · .10~.20 매우 낮음 · .20~.30 낮음 · .30~.40 있음 · .40 이상 높음. 정답률이 아주 높거나 낮은 문항은 낮게 나올 수 있습니다.
        </div>
        <div>
          <strong>신뢰도 α</strong>(Knapp 1991): .50 미만 수용 불가 · .50~.60 낮음 · .60~.70 의심 · .70~.80 수용 가능 · .80~.90 높음 · .90 이상 매우 높음.
        </div>
        <div>
          <strong>답지반응률</strong>: 무표기·복수표기·무효 답은 "무응답·중복"으로 모읍니다(KICE 프로그램과 동일). 오답을 30% 이상이 고르면 "매력적 오답"으로 표시합니다.
        </div>
      </div>
    </details>
  )
}

export function ItemAnalysisTab({ exam, result }: { exam: Exam; result: AnalysisResult }) {
  const selected = useAppStore((s) => s.ui.selectedItemNo)
  const setUi = useAppStore((s) => s.setUi)
  const flagged = result.items.filter((i) => i.flags.some((f) => f.severity !== 'info'))
  const meanP = result.items.length ? result.items.reduce((a, i) => a + (i.p ?? 0), 0) / result.items.length : null
  const lowDisc = result.items.filter((i) => i.disc != null && i.disc < 0.2).length
  return (
    <div className="stack">
      <div className="grid grid-kpi">
        <KpiTile label="신뢰도 α (선다형 KR-20)" value={fmt3(result.overview.alphaMc)} sub={<BandBadge band={alphaBand(result.overview.alphaMc)} />} />
        {result.crCount > 0 && result.overview.alphaAll != null && <KpiTile label="신뢰도 α (배점 가중, 서답형 포함)" value={fmt3(result.overview.alphaAll)} sub={<BandBadge band={alphaBand(result.overview.alphaAll)} />} />}
        <KpiTile label="평균 정답률" value={`${fmt1(meanP)}%`} sub={`${result.mcCount}문항`} />
        <KpiTile label="정답률 50% 미만" value={`${result.items.filter((i) => i.p != null && i.p < 50).length}문항`} sub="절반 이상이 틀린 문항" />
        <KpiTile label="변별도 .20 미만" value={`${lowDisc}문항`} sub="변별력이 낮은 문항" />
        <KpiTile label="확인 필요" value={`${flagged.length}문항`} sub="경고 이상 플래그" />
      </div>
      <section className="card">
        <SectionTitle title="문항별 정답률">점선은 50%. 아래 표의 행을 누르면 성취수준별·학급별 상세를 볼 수 있습니다.</SectionTitle>
        <ItemAccuracyBar items={result.items} />
      </section>
      <section className="card">
        <SectionTitle title="선다형 문항 분석" right={<span className="muted small">행을 누르면 성취수준별·학급별 상세</span>}>
          정답 답지는 진한 칸. 정답률 50% 미만은 노랑, 25% 미만은 빨강으로 표시합니다.
        </SectionTitle>
        <DataTable columns={itemColumns(exam)} rows={result.items} rowKey={(r) => String(r.no)} onRowClick={(r) => setUi({ selectedItemNo: r.no })} selectedKey={selected == null ? null : String(selected)} compact />
        <ThresholdHelp />
      </section>
      <ItemDetailDrawer exam={exam} result={result} no={selected} onClose={() => setUi({ selectedItemNo: null })} />
    </div>
  )
}
