// @vitest-environment happy-dom
/** 업로드 흐름(저장소) 점검 — 실제 File 객체로 */
import { describe, expect, it } from 'vitest'
import { aoaToXlsxBuffer } from './helpers.ts'
import { makeAnswerSheet } from './fixtures/neis.ts'
import { useAppStore } from '../src/ui/store/useAppStore'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function sheetFile(classNo: number, name: string, lastModified: number): File {
  const fx = makeAnswerSheet({ classNo, nItems: 6, nStudents: 8, style: '_2', seed: classNo, keys: [1, 2, 3, 4, 5, 1], points: [5, 5, 5, 5, 5, 5] })
  return new File([aoaToXlsxBuffer(fx.aoa) as Uint8Array<ArrayBuffer>], name, { type: XLSX_TYPE, lastModified })
}

describe('업로드 저장소', () => {
  it('이름이 같은 다른 반 파일을 나중에 추가해도 앞 파일이 남는다', async () => {
    useAppStore.getState().clearAll()
    await useAppStore.getState().addFiles([sheetFile(1, '교과목별학생답정오표.xlsx', 1000)])
    await useAppStore.getState().addFiles([sheetFile(2, '교과목별학생답정오표.xlsx', 2000)])
    let st = useAppStore.getState()
    expect(st.files).toHaveLength(2)
    expect(st.exam!.classes.map((c) => c.classNo)).toEqual(['1', '2'])
    // 똑같은 파일을 다시 올리면 교체 (중복 없음)
    await st.addFiles([sheetFile(2, '교과목별학생답정오표.xlsx', 2000)])
    st = useAppStore.getState()
    expect(st.files).toHaveLength(2)
    expect(st.exam!.classes.reduce((a, c) => a + c.students.length, 0)).toBe(16)
  })

  it('문서보안(DRM)처럼 엑셀이 아닌 파일은 한국어 안내와 함께 표시하고 분석은 계속된다', async () => {
    const junk = new Uint8Array(800).map((_, i) => (i * 53 + 7) % 256)
    await useAppStore.getState().addFiles([new File([junk], '보안문서.xlsx', { type: XLSX_TYPE, lastModified: 5 })])
    const st = useAppStore.getState()
    const bad = st.files.find((f) => f.name === '보안문서.xlsx')!
    expect(bad.status).toBe('error')
    expect(bad.error).toMatch(/문서보안/)
    expect(st.exam).not.toBeNull()
    expect(st.buildErrors).toEqual([])
  })

  it('브라우저 저장소에는 설정만 남고 학생 정보는 남지 않는다', () => {
    useAppStore.getState().setSettings({ excludeNoResponse: false })
    const saved = localStorage.getItem('exam-analysis-settings-v1') ?? ''
    expect(saved).toContain('excludeNoResponse')
    expect(saved).not.toContain('학생01')
    expect(saved).not.toContain('정오표')
    useAppStore.getState().resetSettings()
  })
})
