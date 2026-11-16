import { useEffect } from 'react'
import { Icon, OmrMark } from '../components/Icon'

/** 사용 안내 — 필요한 파일, 알아둘 점, 분석 내용, 계산 방식 */
export function GuidePage() {
  useEffect(() => {
    document.title = '사용 안내 · 성취평가 결과 분석'
    return () => {
      document.title = '성취평가 결과 분석'
    }
  }, [])
  return (
    <>
      <header className="topbar">
        <div className="container container-upload topbar-inner">
          <a className="brand" href="#/">
            <OmrMark />
            성취평가 결과 분석
          </a>
          <div className="actions">
            <a className="btn btn-sm btn-ghost" href="#/">
              <Icon name="arrow-left" />
              <span className="label">파일 올리기</span>
            </a>
          </div>
        </div>
      </header>

      <main className="container container-upload page guide-page">
        <div className="stack">
          <div>
            <h1>사용 안내</h1>
            <p className="muted">
              NEIS에서 내려받은 엑셀 파일을 수정 없이 올리면 정기시험의 성취평가 결과 분석이 바로 나옵니다. 파일은 이 컴퓨터의 브라우저 안에서만 읽고 계산하며, 서버로 보내지 않습니다. 창을 닫거나 새로고침하면
              지워집니다.
            </p>
          </div>

          <section className="card">
            <h2>필요한 파일</h2>
            <p className="xls-rule">
              <Icon name="alert" />
              <span>
                NEIS 출력 화면에서 엑셀로 저장할 때는 반드시 <kbd>XLS data</kbd>를 고르세요.
              </span>
            </p>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>파일</th>
                    <th>필수</th>
                    <th>NEIS 메뉴</th>
                    <th>쓰임</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>교과목별 학생답 정오표</strong>
                    </td>
                    <td className="center">필수</td>
                    <td>교과담임 › 정기시험조회/통계 › 정기시험조회</td>
                    <td>학생 응답과 점수. 정답·배점도 여기서 읽습니다. 반마다 한 파일씩 올립니다.</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>문항정보표</strong>
                    </td>
                    <td className="center">선택</td>
                    <td>교과담임 › 정기시험 › 문항정보표관리</td>
                    <td>성취기준·내용영역·예상 난이도 분석. 정답과 배점만 있는 양식도 올릴 수 있습니다.</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>문항분석표</strong>
                    </td>
                    <td className="center">선택</td>
                    <td>교과담임 › 정기시험조회/통계 › 정기시험통계</td>
                    <td>담당 반만 올렸을 때 학년 전체 수치와 비교합니다. 담당 반 것 하나면 됩니다.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="small">
              <li>파일 종류는 내용을 보고 자동으로 구분하므로 파일 이름은 아무래도 좋습니다. 여러 반 파일을 한꺼번에 올리세요.</li>
              <li>정오표만 있어도 성취도·문항·성취수준별·학생별 분석이 모두 됩니다.</li>
              <li>학교 문서보안(DRM)이나 암호가 걸린 파일은 브라우저에서 열 수 없습니다. 문서보안을 해제한 파일을 올려 주세요.</li>
            </ul>
          </section>

          <section className="card">
            <h2>알아둘 점</h2>
            <ul>
              <li>
                <strong>서답형</strong>: NEIS 정오표에는 서답형 총점만 있어 총점으로 분석합니다. 문항별로 보려면 정오표의 마지막 선다형 문항과 "선택형점수" 열 사이에 <code>서답1, 서답2 …</code> 열을 추가하고 배점 행과
                학생별 점수를 채워 올리세요. 이때 문항정보표의 서답형 문항 성취기준도 함께 분석됩니다.
              </li>
              <li>
                <strong>선다형이 없는 시험</strong>: 선다형 문항이 하나도 없는(전부 서답형인) 시험은 분석할 수 없습니다.
              </li>
              <li>
                <strong>체육·음악·미술</strong>: 성취수준이 3단계(A·B·C)인 교과는 설정의 "성취수준 단계"에서 3단계를 고르세요. 분할점수 기본값은 80/60입니다.
              </li>
              <li>
                <strong>분할점수</strong>: 기본값은 90/80/70/60입니다. 추정 분할점수를 쓰는 과목은 설정에서 값을 바꾸세요.
              </li>
              <li>
                <strong>결시·미응시</strong>: 선다형 응답이 하나도 없는 학생은 평균과 성취수준 비율이 왜곡되지 않도록 기본으로 분석에서 빼고, 개요 탭에 이름을 알려 줍니다. 설정에서 포함할 수 있습니다.
              </li>
              <li>
                <strong>문항분석표 대조</strong>: 문항분석표를 올리면 그 반의 정오표와 문항마다 대조합니다. 모두 일치할 때만 학년 전체 수치로 쓰고, 다르면 쓰지 않고 알려 줍니다.
              </li>
            </ul>
          </section>

          <section className="card">
            <h2>분석 내용</h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>탭</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="nowrap">개요</td>
                    <td>응답자·문항 수, 평균·표준편차, 신뢰도, 성취수준 분포, 점수 분포, 성취수준별 평균</td>
                  </tr>
                  <tr>
                    <td className="nowrap">학급별</td>
                    <td>학급별 성취도, 문항별 학급 정답률, NEIS 양식 문항분석표 재구성</td>
                  </tr>
                  <tr>
                    <td className="nowrap">문항 분석</td>
                    <td>정답률, 난이도 판정, 변별도, 답지반응률, 예상 난이도와 비교, 확인이 필요한 문항 표시</td>
                  </tr>
                  <tr>
                    <td className="nowrap">성취수준별</td>
                    <td>수준별 정답률 상·하위 3문항, 문항별 성취수준 정답률, 수준 역전 문항</td>
                  </tr>
                  <tr>
                    <td className="nowrap">성취기준·영역</td>
                    <td>성취기준별·내용영역별 성취율(전체·수준별·학급별), 보완이 필요한 성취기준</td>
                  </tr>
                  <tr>
                    <td className="nowrap">서답형</td>
                    <td>성취수준별 서답형 총점, (문항별 열이 있으면) 문항별 평균과 점수 분포</td>
                  </tr>
                  <tr>
                    <td className="nowrap">학생별</td>
                    <td>명부와 개인별 리포트: 성취수준, 틀린 문항, 성취기준별 도달 현황</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="small">결과 화면에서 엑셀 내보내기, A4 보고서 인쇄(PDF 저장), 학생 개인별 리포트 인쇄를 할 수 있습니다.</p>
          </section>

          <section className="card">
            <h2>계산 방식</h2>
            <p className="small muted">기존 KICE "성취수준별 평가결과 분석 프로그램"과 같은 값이 나오도록 검증했습니다.</p>
            <ul>
              <li>
                <strong>성취수준</strong>: 총점 ÷ 과목 만점 × 100이 분할점수 이상이면 해당 수준입니다. 선다형 만점 기준으로 바꿀 수 있습니다.
              </li>
              <li>
                <strong>표준편차</strong>: 기본은 모집단(÷N)입니다. 설정에서 표본(÷(N−1))으로 바꿀 수 있습니다.
              </li>
              <li>
                <strong>정답률·답지반응률</strong>: 분모는 집단 전체(무응답 포함)입니다. 무표기·복수표기는 "무응답·중복" 한 칸에 모읍니다.
              </li>
              <li>
                <strong>변별도</strong>: 문항 점수와 (총점 − 문항 점수)의 상관입니다. 총점은 선다형과 서답형의 합입니다.
              </li>
              <li>
                <strong>신뢰도</strong>: 선다형 문항의 KR-20(Cronbach α)입니다.
              </li>
              <li>
                <strong>성취기준 성취율</strong>: 해당 성취기준 문항의 획득 점수 합 ÷ 배점 합 × 100입니다.
              </li>
              <li>
                <strong>해석 기준</strong>: 난이도 75%/25%, 변별도 .10/.20/.30/.40, 신뢰도 .50~.90.
              </li>
            </ul>
          </section>
        </div>
      </main>
    </>
  )
}
