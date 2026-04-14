const configuredApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined

export const appConfig = {
  apiBaseUrl: configuredApiBase === undefined ? '' : configuredApiBase,
}
