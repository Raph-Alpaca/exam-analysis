/** 예시 파일의 수정 시각(고정값) */
const DEMO_MODIFIED = Date.UTC(2026, 0, 1)

/** public/demo 의 합성 예시 파일을 File 객체로 불러온다. */
export async function loadDemoFiles(): Promise<File[]> {
  const base = import.meta.env.BASE_URL
  const manifest = (await (await fetch(`${base}demo/manifest.json`)).json()) as { files: string[] }
  const files: File[] = []
  for (const name of manifest.files) {
    const buf = await (await fetch(`${base}demo/${encodeURIComponent(name)}`)).arrayBuffer()
    // 수정 시각을 고정해야 예시를 다시 불러와도 같은 파일로 알아보고 바꿔 넣는다(안 그러면 두 벌이 쌓인다).
    files.push(new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', lastModified: DEMO_MODIFIED }))
  }
  return files
}
