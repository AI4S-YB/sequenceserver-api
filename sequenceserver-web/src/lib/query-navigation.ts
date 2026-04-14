export function buildQueryHash(queryId: string): string {
  const params = new URLSearchParams()
  params.set('query', queryId)
  return `#${params.toString()}`
}

export function parseQueryHash(hash: string): string {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(normalized).get('query')?.trim() || ''
}
