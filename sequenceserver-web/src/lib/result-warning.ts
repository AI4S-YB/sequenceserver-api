import type { BlastResultWarning } from '../types/api'

export function isBlastResultWarning(value: unknown): value is BlastResultWarning {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return record.user_warning === 'LARGE_RESULT' && Array.isArray(record.download_links)
}
