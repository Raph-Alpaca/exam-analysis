import { useState, type ReactNode } from 'react'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_SETTINGS, describeCutoffs, isValidPassPct, validateCutoffs, validateCutoffs3, type Cutoffs, type Cutoffs3, type Settings } from '../../model/settings'

/** 입력 칸에 적힌 글자. 올바른 값이 됐을 때만 설정에 반영한다(빈 칸이나 입력 도중의 값으로 분석하지 않도록). */
interface Draft {
  cutoffs: Record<keyof Cutoffs, string>
  cutoffs3: Record<keyof Cutoffs3, string>
  pass: string
}

function draftOf(s: Settings): Draft {
  return {
    cutoffs: { AB: String(s.cutoffs.AB), BC: String(s.cutoffs.BC), CD: String(s.cutoffs.CD), DE: String(s.cutoffs.DE) },
    cutoffs3: { AB: String(s.cutoffs3.AB), BC: String(s.cutoffs3.BC) },
    pass: String(s.standardPassPct),
  }
}

/** 빈 칸은 0이 아니라 "값 없음" */
function toNumber(text: string): number {
  return text.trim() === '' ? NaN : Number(text)
}
const toCutoffs = (d: Draft['cutoffs']): Cutoffs => ({ AB: toNumber(d.AB), BC: toNumber(d.BC), CD: toNumber(d.CD), DE: toNumber(d.DE) })
const toCutoffs3 = (d: Draft['cutoffs3']): Cutoffs3 => ({ AB: toNumber(d.AB), BC: toNumber(d.BC) })

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
  const three = settings.levelScheme === 'three'
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings))
  const blank = Object.values(three ? draft.cutoffs3 : draft.cutoffs).some((t) => t.trim() === '')
  const err = blank ? '분할점수를 모두 입력해 주세요.' : three ? validateCutoffs3(toCutoffs3(draft.cutoffs3)) : validateCutoffs(toCutoffs(draft.cutoffs))
  const passOk = isValidPassPct(toNumber(draft.pass))
  const changeCut = (k: keyof Cutoffs, text: string) => {
    const next = { ...draft.cutoffs, [k]: text }
    setDraft({ ...draft, cutoffs: next })
    if (validateCutoffs(toCutoffs(next)) == null) setSettings({ cutoffs: toCutoffs(next) })
  }
  const changeCut3 = (k: keyof Cutoffs3, text: string) => {
    const next = { ...draft.cutoffs3, [k]: text }
    setDraft({ ...draft, cutoffs3: next })
    if (validateCutoffs3(toCutoffs3(next)) == null) setSettings({ cutoffs3: toCutoffs3(next) })
  }
  const changePass = (text: string) => {
    setDraft({ ...draft, pass: text })
    if (isValidPassPct(toNumber(text))) setSettings({ standardPassPct: toNumber(text) })
  }
  const cut = (k: keyof Cutoffs) => (
    <div className="field" key={k}>
      <label htmlFor={`cut-${k}`}>{k[0]}/{k[1]} 분할점수</label>
      <input id={`cut-${k}`} type="number" min={0} max={100} step={0.5} value={draft.cutoffs[k]} onChange={(e) => changeCut(k, e.target.value)} />
    </div>
  )
  const cut3 = (k: keyof Cutoffs3) => (
    <div className="field" key={k}>
      <label htmlFor={`cut3-${k}`}>{k[0]}/{k[1]} 분할점수</label>
      <input id={`cut3-${k}`} type="number" min={0} max={100} step={0.5} value={draft.cutoffs3[k]} onChange={(e) => changeCut3(k, e.target.value)} />
    </div>
  )
  const hasCr = (exam?.maxima.cr ?? 0) > 0
  return (
    <div className="stack settings">
      <section className="stack-sm">
        <h3>성취수준 단계</h3>
        <div className="radio-group">
          <label>
            <input type="radio" name="scheme" checked={!three} onChange={() => setSettings({ levelScheme: 'five' })} />
            <Opt label="5단계 (A~E)" desc="국어·수학·영어·사회·과학 등 대부분의 교과" />
          </label>
          <label>
            <input type="radio" name="scheme" checked={three} onChange={() => setSettings({ levelScheme: 'three' })} />
            <Opt label="3단계 (A·B·C)" desc="체육·음악·미술" />
          </label>
        </div>
      </section>

      <section className="stack-sm">
        <h3>성취수준 분할점수 (%)</h3>
        {three ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(['AB', 'BC'] as const).map(cut3)}
          </div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {(['AB', 'BC', 'CD', 'DE'] as const).map(cut)}
          </div>
        )}
        {err ? (
          <div className="small" style={{ color: 'var(--danger)' }}>
            {err} 이 값은 적용하지 않았습니다. 지금 분석에 쓰는 분할점수는 {describeCutoffs(settings)}입니다.
          </div>
        ) : (
          <div className="hint small muted">
            분할점수 이상이면 해당 수준입니다. {three ? '기본값 80/60.' : '기본값 90/80/70/60 (고정 분할점수). 추정 분할점수를 쓰는 과목은 값을 바꾸세요.'}
          </div>
        )}
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
          <input id="pass" type="number" min={0} max={100} step={5} value={draft.pass} onChange={(e) => changePass(e.target.value)} />
          {passOk ? (
            <span className="hint">이 값 이상이면 도달, 50% 이상이면 부분 도달, 그 미만은 미도달로 표시합니다.</span>
          ) : (
            <span className="hint" style={{ color: 'var(--danger)' }}>
              0~100 사이의 값을 입력해 주세요. 이 값은 적용하지 않았습니다. 지금은 {settings.standardPassPct}%를 기준으로 표시합니다.
            </span>
          )}
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
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            resetSettings()
            setDraft(draftOf(DEFAULT_SETTINGS))
          }}
        >
          기본값으로
        </button>
        <span className="muted small">설정은 이 브라우저에 저장됩니다(학생 자료는 저장하지 않습니다).</span>
      </div>
    </div>
  )
}
