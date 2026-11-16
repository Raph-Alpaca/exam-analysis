/**
 * 서답형·선다형을 가리키는 여러 표기.
 * NEIS 양식·학교·연도에 따라 "서답형", "서술형", "논술형", "서·논술형" 등으로 달라서 한곳에 모은다.
 */
const CR = '(?:서답형|서술형|논술형|서\\s*[·ㆍ・‧⋅.,/]?\\s*논술형|단답형|주관식)'
const MC = '(?:선택형|선다형|객관식)'

/** 구역 제목: "서답형 문항", "서·논술형 문항", "서답형" */
export const RE_CR_SECTION = new RegExp(`^${CR}\\s*(?:문항)?$|^${CR}\\s*문항`)
export const RE_MC_SECTION = new RegExp(`^${MC}\\s*(?:문항)?$|^${MC}\\s*문항`)

/** 정오표 점수 열 머리글: "서답형점수", "서술형 점수", "서·논술형점수" */
export const RE_CR_SCORE = new RegExp(`${CR}\\s*점수`)
export const RE_MC_SCORE = new RegExp(`${MC}\\s*점수`)

/** 문항정보표 만점 줄: "선택형 70.00 점  서답형 30.00 점" */
export const RE_CR_MAX = new RegExp(`${CR}\\s*([\\d.]+)\\s*점`)
export const RE_MC_MAX = new RegExp(`${MC}\\s*([\\d.]+)\\s*점`)

/** 문항 이름 안의 서답형 낱말: "서답1", "서술형 2", "논술1" */
export const RE_CR_LABEL = /서답|서술|논술|단답|주관/
const RE_MC_LABEL = /선택|선다|객관/

export interface ItemNo {
  no: number
  /** 이름에 서답형 낱말이 있어 구역과 무관하게 서답형으로 봐야 하는지 */
  cr: boolean
}

/**
 * 문항번호 칸 해석: "3", "3번", "서답1", "서술형 2", "[논술형1]", "선택형 5".
 * 숫자 하나와 (있다면) 문항 종류 낱말로만 이루어진 경우에만 읽는다. "1-(2)" 같은 하위 문항은 null.
 */
export function parseItemNo(raw: string): ItemNo | null {
  const s = raw.replace(/[\s[\]()<>]/g, '')
  if (!s) return null
  const m = /^(\D*?)(\d+)(?:번|문항)?$/.exec(s)
  if (!m) return null
  const prefix = m[1]!
  const no = Number(m[2])
  if (prefix === '') return { no, cr: false }
  if (RE_CR_LABEL.test(prefix)) return { no, cr: true }
  if (RE_MC_LABEL.test(prefix)) return { no, cr: false }
  return null
}
