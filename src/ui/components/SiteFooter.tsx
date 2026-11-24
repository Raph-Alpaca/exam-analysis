/** 문의 메일 주소 */
const CONTACT_EMAIL = 'raphres@sen.go.kr'

/**
 * 문의 안내 문장. 화면 하단과 사용 안내의 "문의" 항목이 함께 쓴다.
 * 메일 주소는 링크로 만들지 않는다(학교 PC 에는 기본 메일 프로그램이 없어 눌러도 반응이 없다).
 */
export function ContactLine() {
  return (
    <>
      사용하면서 불편한 점이나 개선 아이디어는 <span className="nowrap">{CONTACT_EMAIL}</span>로 보내 주세요.
    </>
  )
}

/**
 * 화면 하단 공통 안내 — 문의, 참고용 안내, 만든 곳.
 * 파일 올리기·결과·사용 안내 화면에 넣고, 인쇄물에는 넣지 않는다(print.css 에서 숨김).
 */
export function SiteFooter({ narrow, contact = true, guideLink = true }: { /** 좁은 본문 폭(파일 올리기·사용 안내)에 맞춘다 */ narrow?: boolean; contact?: boolean; guideLink?: boolean }) {
  return (
    <footer className="site-foot">
      <div className={`container${narrow ? ' container-upload' : ''}`}>
        {contact && (
          <p className="contact">
            <ContactLine />
          </p>
        )}
        <p>분석 결과는 수업·평가 개선을 위한 참고 자료이며, 공식 성적과 성취도는 NEIS 기준입니다.</p>
        <p className="meta">
          <span>서울특별시교육청 학생평가지원단 교사가 만들었습니다.</span>
          <span>올린 파일은 이 브라우저 밖으로 나가지 않습니다.</span>
          {guideLink && <a href="#/guide">사용 안내</a>}
        </p>
      </div>
    </footer>
  )
}
