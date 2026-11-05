import type { ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import { validateCutoffs } from '../../model/settings'

/** 선택지 이름과 그 아래 한 줄 설명 */
function Opt({ label, desc }: { label: ReactNode; desc?: ReactNode }) {
  return (
    <span className="opt">
      <span className="opt-label">{label}</span>
      {desc && <span className="opt-desc">{desc}</span>}
    </span>
  )
}

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)
  const resetSettings = useAppStore((s) => s.resetSettings)
  const exam = useAppStore((s) => s.exam)
  const err = validateCutoffs(settings.cutoffs)
  const cut = (k: keyof typeof settings.cutoffs) => (
    <div className="field" key={k}>
      <label htmlFor={`cut-${k}`}>{k.replace('', '')[0]}/{k[1]} 분할점수</label>
      <input id={`cut-${k}`} type="number" min={0} max={100} step={0.5} value={settings.cutoffs[k]} onChange={(e) => setSettings({ cutoffs: { ...settings.cutoffs, [k]: Number(e.target.value) } })} />
    </div>
  )
  const hasCr = (exam?.maxima.cr ?? 0) > 0
  return (
    <div className="stack settings">
      <section className="stack-sm">
        <h3>성취수준 분할점수 (%)</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {(['AB', 'BC', 'CD', 'DE'] as const).map(cut)}
        </div>
        {err ? <div className="small" style={{ color: 'var(--danger)' }}>{err}</div> : <div className="hint small muted">분할점수 이상이면 해당 수준입니다. 기본값 90/80/70/60 (고정 분할점수). 추정 분할점수를 쓰는 과목은 값을 바꾸세요.</div>}
      </section>

      <section className="stack-sm">
        <h3>성취수준 산출 기준</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="basis" checked={settings.levelBasis === 'subjectMax'} onChange={() => setSettings({ levelBasis: 'subjectMax' })} />
            <Opt label="과목 만점 기준" desc={`영역총점 ÷ 과목만점${exam ? ` ${exam.maxima.total}` : ''}`} />
          </label>
          <label>
            <input type="radio" name="basis" checked={settings.levelBasis === 'mcMax'} onChange={() => setSettings({ levelBasis: 'mcMax' })} disabled={!hasCr} />
            <Opt label="선다형 만점 기준" desc={`선택형점수 ÷ 선택형만점${exam ? ` ${exam.maxima.mc}` : ''}${hasCr ? '' : '. 서답형이 없어 두 기준이 같습니다.'}`} />
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>표준편차</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="sd" checked={settings.sdMode === 'population'} onChange={() => setSettings({ sdMode: 'population' })} />
            <Opt label="모집단 (÷N)" desc="KICE 분석 프로그램과 같은 값" />
          </label>
          <label>
            <input type="radio" name="sd" checked={settings.sdMode === 'sample'} onChange={() => setSettings({ sdMode: 'sample' })} />
            <Opt label="표본 (÷(N−1))" desc="엑셀 STDEV.S와 같은 값" />
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>총점 출처</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="src" checked={settings.scoreSource === 'neis'} onChange={() => setSettings({ scoreSource: 'neis' })} />
            <Opt label="NEIS 영역총점" desc="공식 성적과 같은 값" />
          </label>
          <label>
            <input type="radio" name="src" checked={settings.scoreSource === 'recomputed'} onChange={() => setSettings({ scoreSource: 'recomputed' })} />
            <Opt label="응답으로 재계산" desc="정답 문항 배점 합 + 서답형 + 기타" />
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>학생 리포트</h3>
        <div className="field">
          <label htmlFor="pass">성취기준 "도달" 기준 성취율 (%)</label>
          <input id="pass" type="number" min={0} max={100} step={5} value={settings.standardPassPct} onChange={(e) => setSettings({ standardPassPct: Number(e.target.value) })} />
          <span className="hint">이 값 이상이면 도달, 50% 이상이면 부분 도달, 그 미만은 미도달로 표시합니다.</span>
        </div>
      </section>

      <section className="stack-sm">
        <h3>결시·미응시</h3>
        <label className="checkbox">
          <input type="checkbox" checked={settings.excludeNoResponse} onChange={(e) => setSettings({ excludeNoResponse: e.target.checked })} />
          <Opt label="선다형 응답이 하나도 없는 학생은 분석에서 뺍니다" desc="결시생이 0점으로 섞여 평균·성취수준 비율·신뢰도가 왜곡되는 것을 막습니다. 뺀 학생은 개요 탭 안내에 이름이 나옵니다." />
        </label>
      </section>

      <section className="stack-sm">
        <h3>학년 전체 비교</h3>
        <label className="checkbox">
          <input type="checkbox" checked={settings.uploadedIsWholeGrade} onChange={(e) => setSettings({ uploadedIsWholeGrade: e.target.checked })} />
          <Opt label="올린 반이 학년 전체입니다" desc={'체크하면 문항분석표 없이도 "학년 전체" 열을 올린 반 합계로 표시합니다.'} />
        </label>
      </section>

      <div className="row">
        <button type="button" className="btn btn-sm" onClick={resetSettings}>
          기본값으로
        </button>
        <span className="muted small">설정은 이 브라우저에 저장됩니다(학생 자료는 저장하지 않습니다).</span>
      </div>
    </div>
  )
}
