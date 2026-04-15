import type { HitActionConfig } from './config'

export type HitActionContext = {
  jobId: string
  queryId: string
  queryTitle?: string
  hitId: string
  hitTitle?: string
  species?: string
  databaseIds: string[]
}

export type ResolvedHitAction = {
  id: string
  label: string
  target: '_blank' | '_self'
  url: string
}

function replacePlaceholders(template: string, context: HitActionContext): string {
  const values: Record<string, string> = {
    jobId: context.jobId,
    queryId: context.queryId,
    queryTitle: context.queryTitle || '',
    hitId: context.hitId,
    hitTitle: context.hitTitle || '',
    species: context.species || '',
    databaseIds: context.databaseIds.join(','),
    firstDatabaseId: context.databaseIds[0] || '',
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return encodeURIComponent(values[key] || '')
  })
}

export function resolveHitActions(
  actions: HitActionConfig[],
  context: HitActionContext,
  isChinese: boolean,
): ResolvedHitAction[] {
  return actions
    .map((action, index) => {
      const label =
        (isChinese ? action.labelZh : action.labelEn) ||
        action.label ||
        (isChinese ? `扩展操作 ${index + 1}` : `Action ${index + 1}`)
      const url = replacePlaceholders(action.url, context)

      return {
        id: action.id || `action-${index + 1}`,
        label,
        target: action.target === '_self' ? '_self' as const : '_blank' as const,
        url,
      }
    })
    .filter((action) => action.url.trim().length > 0)
}
