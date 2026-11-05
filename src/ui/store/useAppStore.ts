import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Exam, Level, Warning } from '../../model/types'
import { DEFAULT_SETTINGS, type Settings } from '../../model/settings'
import { readWorkbookFile } from '../../xlsx/readWorkbook'
import { buildExam, FILE_KIND_LABEL, parseGrids, type FileKind, type ParsedFile } from '../../parsers/index'

export interface FileEntry {
  id: string
  name: string
  size: number
  lastModified: number
  status: 'parsing' | 'ok' | 'error'
  kind?: FileKind
  label?: string
  error?: string
  parsed?: ParsedFile
}

export interface UiState {
  classFilter: string[]
  selectedItemNo: number | null
  selectedStudentId: string | null
  selectedLevel: Level | 'all'
  settingsOpen: boolean
  printSections: Record<string, boolean>
}

interface AppState {
  files: FileEntry[]
  exam: Exam | null
  buildErrors: Warning[]
  buildWarnings: Warning[]
  settings: Settings
  ui: UiState
  addFiles: (files: File[]) => Promise<void>
  removeFile: (id: string) => void
  clearAll: () => void
  setSettings: (patch: Partial<Settings>) => void
  resetSettings: () => void
  setUi: (patch: Partial<UiState>) => void
}

let seq = 0

function describe(p: ParsedFile): string {
  const base = FILE_KIND_LABEL[p.kind]
  if (p.answers) return `${base} · ${p.answers.classNos.map((c) => `${c}반`).join(', ')} · ${p.answers.students.length}명 · ${p.answers.mcItems.length}문항`
  if (p.itemInfo) return `${base} · ${p.itemInfo.items.length}문항 · 성취기준 ${p.itemInfo.standards.length}개`
  if (p.answerKey) return `${base} · ${p.answerKey.items.length}문항`
  if (p.itemAnalysis) return `${base} · ${p.itemAnalysis.items.length}문항 · 학년 ${p.itemAnalysis.gradeN ?? '?'}명`
  return base
}

function rebuild(files: FileEntry[]): Pick<AppState, 'exam' | 'buildErrors' | 'buildWarnings'> {
  const parsed = files.filter((f) => f.status === 'ok' && f.parsed).map((f) => f.parsed!)
  if (parsed.length === 0) return { exam: null, buildErrors: [], buildWarnings: [] }
  const r = buildExam(parsed)
  return { exam: r.exam, buildErrors: r.errors, buildWarnings: r.warnings }
}

const DEFAULT_UI: UiState = {
  classFilter: [],
  selectedItemNo: null,
  selectedStudentId: null,
  selectedLevel: 'all',
  settingsOpen: false,
  printSections: {},
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      files: [],
      exam: null,
      buildErrors: [],
      buildWarnings: [],
      settings: DEFAULT_SETTINGS,
      ui: DEFAULT_UI,

      async addFiles(list) {
        const incoming = list.filter((f) => /\.xlsx?$/i.test(f.name) || /spreadsheet|excel/i.test(f.type))
        const skipped = list.length - incoming.length
        const entries: FileEntry[] = incoming.map((f) => ({ id: `f${++seq}`, name: f.name, size: f.size, lastModified: f.lastModified, status: 'parsing' }))
        const same = (e: FileEntry, f: File) => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified
        set((s) => ({ files: [...s.files.filter((e) => !incoming.some((f) => same(e, f))), ...entries] }))
        await Promise.all(
          incoming.map(async (file, i) => {
            const entry = entries[i]!
            let next: Partial<FileEntry>
            try {
              const grids = await readWorkbookFile(file)
              const parsed = parseGrids(grids, file.name)
              next = parsed.error ? { status: 'error', kind: parsed.kind, error: parsed.error, parsed } : { status: 'ok', kind: parsed.kind, label: describe(parsed), parsed }
            } catch (e) {
              next = { status: 'error', error: e instanceof Error ? e.message : String(e) }
            }
            set((s) => ({ files: s.files.map((f) => (f.id === entry.id ? { ...f, ...next } : f)) }))
          }),
        )
        const built = rebuild(get().files)
        if (skipped > 0) built.buildWarnings = [{ level: 'info', code: 'skipped-files', message: `엑셀(.xlsx/.xls)이 아닌 파일 ${skipped}개는 무시했습니다.` }, ...built.buildWarnings]
        set({ ...built, ui: { ...get().ui, classFilter: [], selectedItemNo: null, selectedStudentId: null } })
      },

      removeFile(id) {
        const files = get().files.filter((f) => f.id !== id)
        set({ files, ...rebuild(files), ui: { ...get().ui, classFilter: [], selectedStudentId: null } })
      },

      clearAll() {
        set({ files: [], exam: null, buildErrors: [], buildWarnings: [], ui: { ...DEFAULT_UI } })
      },

      setSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch, cutoffs: { ...s.settings.cutoffs, ...(patch.cutoffs ?? {}) } } }))
      },
      resetSettings() {
        set({ settings: DEFAULT_SETTINGS })
      },
      setUi(patch) {
        set((s) => ({ ui: { ...s.ui, ...patch } }))
      },
    }),
    {
      name: 'exam-analysis-settings-v1',
      // 설정만 저장. 파일·학생 자료는 절대 저장하지 않는다.
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted as Partial<AppState> | undefined) ?? {}
        return { ...current, settings: { ...current.settings, ...(p.settings ?? {}), cutoffs: { ...current.settings.cutoffs, ...(p.settings?.cutoffs ?? {}) } } }
      },
    },
  ),
)
