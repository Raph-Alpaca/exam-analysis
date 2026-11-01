import type { ExamHeader } from '../model/types'

/**
 * 정오표 3행 "2026학년도   1학기   주간 3학년   1반   중간고사   과학" 해석.
 * 반 뒤의 나머지는 2칸 이상 공백으로 나눠 [고사명, 교과목].
 */
export function parseExamHeader(raw: string): ExamHeader {
  const out: ExamHeader = { raw: raw.trim() }
  const s = raw.trim()
  const m = /(\d{4})\s*학년도/.exec(s)
  if (m) out.year = m[1]
  const sem = /(\d)\s*학기/.exec(s)
  if (sem) out.semester = sem[1]
  const gr = /(\d)\s*학년(?!도)/.exec(s)
  if (gr) out.grade = gr[1]
  const cls = /(\d+)\s*반/.exec(s)
  let rest = ''
  if (cls) {
    out.classNo = String(Number(cls[1]))
    rest = s.slice(cls.index + cls[0].length)
  } else if (gr) {
    rest = s.slice(gr.index + gr[0].length)
  }
  const parts = rest
    .split(/\s{2,}|\t/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  if (parts.length >= 2) {
    out.examName = parts[0]
    out.subject = parts[parts.length - 1]
  } else if (parts.length === 1) {
    const tokens = parts[0]!.split(/\s+/)
    if (tokens.length >= 2) {
      out.subject = tokens[tokens.length - 1]
      out.examName = tokens.slice(0, -1).join(' ')
    } else {
      out.examName = parts[0]
    }
  }
  return out
}

export function describeHeader(h: ExamHeader): string {
  const bits: string[] = []
  if (h.year) bits.push(`${h.year}학년도`)
  if (h.semester) bits.push(`${h.semester}학기`)
  if (h.grade) bits.push(`${h.grade}학년`)
  if (h.examName) {
    const prefix = h.grade ? `${h.grade}학년` : ''
    const name = prefix && h.examName.startsWith(prefix) ? h.examName.slice(prefix.length).trim() : h.examName
    if (name) bits.push(name)
  }
  if (h.subject) bits.push(h.subject)
  return bits.length ? bits.join(' ') : h.raw
}
