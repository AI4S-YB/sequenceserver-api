type JsonRecord = Record<string, unknown>

export interface BlastQueryPreview {
  id: string
  title: string
  length?: number
  number?: number
  hitCount: number
  topHit?: BlastHitPreview
  hits: BlastHitPreview[]
}

export interface BlastHitPreview {
  id: string
  title: string
  length?: number
  totalScore?: number
  qcovs?: number
  sciname?: string
  hsps: BlastHspPreview[]
}

export interface BlastHspPreview {
  number?: number
  evalue?: number
  bitScore?: number
  score?: number
  identity?: number
  positives?: number
  gaps?: number
  length?: number
  qcovhsp?: number
  qstart?: number
  qend?: number
  sstart?: number
  send?: number
  qframe?: number
  sframe?: number
  qseq?: string
  sseq?: string
  midline?: string
}

function summarizeBlastHsp(item: JsonRecord): BlastHspPreview {
  return {
    number: asNumber(item.number),
    evalue: asNumber(item.evalue),
    bitScore: asNumber(item.bit_score),
    score: asNumber(item.score),
    identity: asNumber(item.identity),
    positives: asNumber(item.positives),
    gaps: asNumber(item.gaps),
    length: asNumber(item.length),
    qcovhsp: asNumber(item.qcovhsp),
    qstart: asNumber(item.qstart),
    qend: asNumber(item.qend),
    sstart: asNumber(item.sstart),
    send: asNumber(item.send),
    qframe: asNumber(item.qframe),
    sframe: asNumber(item.sframe),
    qseq: asString(item.qseq),
    sseq: asString(item.sseq),
    midline: asString(item.midline),
  }
}

function summarizeBlastHit(item: JsonRecord): BlastHitPreview {
  const hsps = Array.isArray(item.hsps) ? item.hsps.filter(isRecord).map(summarizeBlastHsp) : []

  return {
    id: asString(item.id) || '未命名命中',
    title: asString(item.title) || '-',
    length: asNumber(item.length),
    totalScore: asNumber(item.total_score),
    qcovs: asNumber(item.qcovs),
    sciname: asString(item.sciname),
    hsps,
  }
}

export interface BlastResultSummary {
  searchId?: string
  program?: string
  programVersion?: string
  databaseTitles: string[]
  queryCount: number
  queriesWithHits: number
  totalHits: number
  params: Array<{ key: string; value: string }>
  stats: Array<{ key: string; value: string }>
  queries: BlastQueryPreview[]
}

export interface DatabaseResultSummary {
  id?: string
  name?: string
  title?: string
  type?: string
  indexed?: boolean
  nsequences?: number
  ncharacters?: number
  updatedOn?: string
  format?: string
  categories: string[]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

export function formatCount(value?: number): string {
  return typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '-'
}

export function summarizeBlastResult(result: unknown): BlastResultSummary | null {
  if (!isRecord(result)) return null

  const queriesValue = Array.isArray(result.queries) ? result.queries : []
  const querydbValue = Array.isArray(result.querydb) ? result.querydb : []
  const paramsValue = isRecord(result.params) ? result.params : {}
  const statsValue = isRecord(result.stats) ? result.stats : {}

  const queries = queriesValue
    .map((item, index): BlastQueryPreview | null => {
      if (!isRecord(item)) return null

      const hits = Array.isArray(item.hits) ? item.hits.filter(isRecord).map(summarizeBlastHit) : []
      const topHit = hits[0]

      return {
        id: asString(item.id) || `query_${index + 1}`,
        title: asString(item.title) || '-',
        number: asNumber(item.number),
        length: asNumber(item.length),
        hitCount: hits.length,
        topHit,
        hits,
      }
    })
    .filter((item): item is BlastQueryPreview => item !== null)

  const databaseTitles = querydbValue
    .map((item) => {
      if (!isRecord(item)) return undefined
      return asString(item.title) || asString(item.name) || asString(item.id)
    })
    .filter((item): item is string => Boolean(item))

  return {
    searchId: asString(result.search_id),
    program: asString(result.program),
    programVersion: asString(result.program_version),
    databaseTitles,
    queryCount: queries.length,
    queriesWithHits: queries.filter((query) => query.hitCount > 0).length,
    totalHits: queries.reduce((sum, query) => sum + query.hitCount, 0),
    params: Object.entries(paramsValue).map(([key, value]) => ({ key, value: toDisplayValue(value) })),
    stats: Object.entries(statsValue).map(([key, value]) => ({ key, value: toDisplayValue(value) })),
    queries,
  }
}

export function summarizeDatabaseResult(result: unknown): DatabaseResultSummary | null {
  if (!isRecord(result)) return null

  const categories = Array.isArray(result.categories)
    ? result.categories.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []

  return {
    id: asString(result.id),
    name: asString(result.name),
    title: asString(result.title),
    type: asString(result.type),
    indexed: typeof result.indexed === 'boolean' ? result.indexed : undefined,
    nsequences: asNumber(result.nsequences),
    ncharacters: asNumber(result.ncharacters),
    updatedOn: asString(result.updated_on),
    format: asString(result.format),
    categories,
  }
}
