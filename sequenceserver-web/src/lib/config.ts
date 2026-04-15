export type HitActionConfig = {
  id?: string
  label?: string
  labelZh?: string
  labelEn?: string
  url: string
  target?: '_blank' | '_self'
}

const configuredApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
const configuredHitActions = import.meta.env.VITE_HIT_ACTIONS_JSON as string | undefined

function parseHitActions(): HitActionConfig[] {
  if (!configuredHitActions?.trim()) return []

  try {
    const parsed = JSON.parse(configuredHitActions)
    if (!Array.isArray(parsed)) return []

    return parsed.filter((item): item is HitActionConfig => {
      return Boolean(item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim())
    })
  } catch {
    return []
  }
}

export const appConfig = {
  apiBaseUrl: configuredApiBase === undefined ? '' : configuredApiBase,
  hitActions: parseHitActions(),
}
