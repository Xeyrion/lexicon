import type { StorageKind } from '../../lib/storageInfo'

export const STORAGE_FILES: { kind: StorageKind; label: string }[] = [
  { kind: 'study', label: '学习记录' },
  { kind: 'reader', label: '阅读库' },
  { kind: 'reader-progress', label: '阅读进度' },
  { kind: 'library', label: '书架' },
]
