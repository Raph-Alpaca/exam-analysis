import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // 작은 글꼴 조각을 CSS 안에 data: 주소로 끼워 넣지 않는다.
    // 보안 헤더(public/_headers)가 글꼴을 같은 출처의 파일로만 허용하므로, 끼워 넣으면 그 조각이 막힌다.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/_probe/**', 'node_modules/**'],
    // 첫 실행 때 엑셀 라이브러리(ExcelJS) 로딩이 수 초 걸릴 수 있어 넉넉히
    testTimeout: 60000,
  },
})
