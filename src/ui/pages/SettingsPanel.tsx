import { useAppStore } from '../store/useAppStore'
import { validateCutoffs } from '../../model/settings'

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
    <div className="stack">
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
            <span>
              과목 만점 기준 <span className="muted small">(영역총점 ÷ 과목만점{exam ? ` ${exam.maxima.total}` : ''})</span>
            </span>
          </label>
          <label>
            <input type="radio" name="basis" checked={settings.levelBasis === 'mcMax'} onChange={() => setSettings({ levelBasis: 'mcMax' })} disabled={!hasCr} />
            <span>
              선다형 만점 기준 <span className="muted small">(선택형점수 ÷ 선택형만점{exam ? ` ${exam.maxima.mc}` : ''}){!hasCr && ' — 서답형이 없어 두 기준이 같습니다'}</span>
            </span>
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>표준편차</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="sd" checked={settings.sdMode === 'population'} onChange={() => setSettings({ sdMode: 'population' })} />
            <span>
              모집단 (÷N) <span className="muted small">— KICE 분석 프로그램과 같은 값</span>
            </span>
          </label>
          <label>
            <input type="radio" name="sd" checked={settings.sdMode === 'sample'} onChange={() => setSettings({ sdMode: 'sample' })} />
            <span>
              표본 (÷(N−1)) <span className="muted small">— 엑셀 STDEV.S</span>
            </span>
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>총점 출처</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="src" checked={settings.scoreSource === 'neis'} onChange={() => setSettings({ scoreSource: 'neis' })} />
            <span>
              NEIS 영역총점 <span className="muted small">— 공식 성적과 동일</span>
            </span>
          </label>
          <label>
            <input type="radio" name="src" checked={settings.scoreSource === 'recomputed'} onChange={() => setSettings({ scoreSource: 'recomputed' })} />
            <span>
              응답으로 재계산 <span className="muted small">— 정답 문항 배점 합 + 서답형 + 기타</span>
            </span>
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
        <h3>학년 전체 비교</h3>
        <label className="checkbox">
          <input type="checkbox" checked={settings.uploadedIsWholeGrade} onChange={(e) => setSettings({ uploadedIsWholeGrade: e.target.checked })} />
          <span>
            올린 반이 학년 전체입니다 <span className="muted small">— 체크하면 문항분석표 없이도 "학년 전체" 열을 올린 반 합계로 표시합니다.</span>
          </span>
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
