/** public/demo 의 합성 예시 파일을 File 객체로 불러온다. */
export async function loadDemoFiles(): Promise<File[]> {
  const base = import.meta.env.BASE_URL
  const manifest = (await (await fetch(`${base}demo/manifest.json`)).json()) as { files: string[] }
  const files: File[] = []
  for (const name of manifest.files) {
    const buf = await (await fetch(`${base}demo/${encodeURIComponent(name)}`)).arrayBuffer()
    files.push(new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  }
  return files
}
