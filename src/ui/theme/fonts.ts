/**
 * 글꼴(IBM Plex Sans KR, OFL 라이선스)을 사이트에 함께 싣는다. 바깥 서버(Google Fonts)에 요청하지 않는다.
 * 글자 범위별로 잘게 나뉜 파일이라 방문자는 화면에 쓰인 조각만 받는다.
 * 굵기는 CSS 에서 쓰는 네 가지(400·500·600·700)만.
 *
 * 글자 범위 목록 때문에 이 CSS 가 꽤 크므로(약 220KB), main.tsx 에서 따로 늦게 불러와 첫 화면을 막지 않게 한다.
 * 그동안은 tokens.css 의 대체 글꼴(맑은 고딕 등)로 보이다가 바뀐다.
 */
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import '@fontsource/ibm-plex-sans-kr/700.css'
