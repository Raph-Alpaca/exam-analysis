import { useMemo } from 'react'
import { useAppStore } from './useAppStore'
import { analyze } from '../../stats/analyze'
import type { AnalysisResult } from '../../model/types'

/** 현재 시험·설정·학급 필터로 계산한 분석 결과 (메모이즈) */
export function useAnalysis(): AnalysisResult | null {
  const exam = useAppStore((s) => s.exam)
  const settings = useAppStore((s) => s.settings)
  const classFilter = useAppStore((s) => s.ui.classFilter)
  return useMemo(() => (exam ? analyze(exam, settings, { classFilter }) : null), [exam, settings, classFilter])
}

/** 학급 필터와 무관한 전체 결과 (학년 전체 비교·학생 리포트용) */
export function useFullAnalysis(): AnalysisResult | null {
  const exam = useAppStore((s) => s.exam)
  const settings = useAppStore((s) => s.settings)
  return useMemo(() => (exam ? analyze(exam, settings) : null), [exam, settings])
}
