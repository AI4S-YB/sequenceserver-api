import { appConfig } from './config'
import type {
  ApiEnvelope,
  ApiErrorPayload,
  BlastFormConfig,
  BlastJobInput,
  BlastResultWarning,
  Database,
  DeleteDatabaseResult,
  Job,
  JobLog,
  PendingDatabase,
  SequenceLookupResult,
} from '../types/api'

class ApiClientError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function buildApiUrl(path: string): string {
  return `${appConfig.apiBaseUrl}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  const text = await response.text()
  const json = text ? JSON.parse(text) : null

  if (!response.ok) {
    const payload = json as ApiErrorPayload | null
    throw new ApiClientError(
      payload?.error?.message || `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code,
    )
  }

  return json as T
}

export async function fetchDatabases(): Promise<Database[]> {
  const payload = await request<ApiEnvelope<Database[]>>('/api/v1/databases')
  return payload.data
}

export async function fetchBlastFormConfig(): Promise<BlastFormConfig> {
  const payload = await request<ApiEnvelope<BlastFormConfig>>('/api/v1/frontend/blast_form')
  return payload.data
}

export async function fetchSequences(input: {
  sequenceIds: string[]
  databaseIds: string[]
}): Promise<SequenceLookupResult> {
  const search = new URLSearchParams()
  search.set('sequence_ids', input.sequenceIds.join(','))
  search.set('database_ids', input.databaseIds.join(','))

  const payload = await request<ApiEnvelope<SequenceLookupResult>>(`/api/v1/sequences?${search.toString()}`)
  return payload.data
}

export function buildSequenceDownloadUrl(input: {
  sequenceIds: string[]
  databaseIds: string[]
}): string {
  const search = new URLSearchParams()
  search.set('sequence_ids', input.sequenceIds.join(','))
  search.set('database_ids', input.databaseIds.join(','))
  return buildApiUrl(`/api/v1/sequences/download?${search.toString()}`)
}

export function submitSequenceDownload(input: {
  sequenceIds: string[]
  databaseIds: string[]
}): void {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = buildApiUrl('/api/v1/sequences/download')
  form.style.display = 'none'

  const sequenceIds = document.createElement('input')
  sequenceIds.type = 'hidden'
  sequenceIds.name = 'sequence_ids'
  sequenceIds.value = input.sequenceIds.join(',')

  const databaseIds = document.createElement('input')
  databaseIds.type = 'hidden'
  databaseIds.name = 'database_ids'
  databaseIds.value = input.databaseIds.join(',')

  form.append(sequenceIds, databaseIds)
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

export async function fetchBlastJobs(params?: { status?: string; limit?: number }): Promise<Job[]> {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.limit) search.set('limit', String(params.limit))

  const suffix = search.toString() ? `?${search}` : ''
  const payload = await request<ApiEnvelope<Job[]>>(`/api/v1/blast_jobs${suffix}`)
  return payload.data
}

export async function fetchDatabaseJobs(params?: { status?: string; limit?: number }): Promise<Job[]> {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.limit) search.set('limit', String(params.limit))

  const suffix = search.toString() ? `?${search}` : ''
  const payload = await request<ApiEnvelope<Job[]>>(`/api/v1/database_jobs${suffix}`)
  return payload.data
}

export async function fetchBlastJob(id: string): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>(`/api/v1/blast_jobs/${id}`)
  return payload.data
}

export async function fetchBlastJobInput(id: string): Promise<BlastJobInput> {
  const payload = await request<ApiEnvelope<BlastJobInput>>(`/api/v1/blast_jobs/${id}/input`)
  return payload.data
}

export async function fetchDatabaseJob(id: string): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>(`/api/v1/database_jobs/${id}`)
  return payload.data
}

export async function cancelBlastJob(id: string): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>(`/api/v1/blast_jobs/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return payload.data
}

export async function cancelDatabaseJob(id: string): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>(`/api/v1/database_jobs/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return payload.data
}

export async function fetchBlastJobLog(id: string, stream: 'stdout' | 'stderr'): Promise<JobLog> {
  const payload = await request<ApiEnvelope<JobLog>>(`/api/v1/blast_jobs/${id}/logs/${stream}`)
  return payload.data
}

export async function fetchDatabaseJobLog(id: string, stream: 'stdout' | 'stderr'): Promise<JobLog> {
  const payload = await request<ApiEnvelope<JobLog>>(`/api/v1/database_jobs/${id}/logs/${stream}`)
  return payload.data
}

export async function fetchBlastJobResult(
  id: string,
  options?: { bypassFileSizeWarning?: boolean },
): Promise<unknown | BlastResultWarning> {
  const search = new URLSearchParams()
  if (options?.bypassFileSizeWarning) {
    search.set('bypass_file_size_warning', 'true')
  }

  const suffix = search.toString() ? `?${search.toString()}` : ''
  const payload = await request<ApiEnvelope<unknown | BlastResultWarning>>(`/api/v1/blast_jobs/${id}/result${suffix}`)
  return payload.data
}

export async function fetchDatabaseJobResult(id: string): Promise<unknown> {
  const payload = await request<ApiEnvelope<unknown>>(`/api/v1/database_jobs/${id}/result`)
  return payload.data
}

export async function createBlastJob(input: {
  sequence: string
  databases: string[]
  method: string
  advanced?: string
}): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>('/api/v1/blast_jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return payload.data
}

export async function createDatabase(input: {
  name?: string
  sequence?: string
  source?: Record<string, unknown>
  title?: string
  type?: string
  auto_index?: boolean
  taxid?: number
}): Promise<PendingDatabase> {
  const payload = await request<ApiEnvelope<PendingDatabase>>('/api/v1/databases', {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return payload.data
}

export async function createDatabaseIndex(id: string, input?: {
  title?: string
  type?: string
  taxid?: number
}): Promise<Job> {
  const payload = await request<ApiEnvelope<Job>>(`/api/v1/databases/${id}/index`, {
    method: 'POST',
    body: JSON.stringify(input || {}),
  })

  return payload.data
}

export async function deleteDatabase(id: string): Promise<DeleteDatabaseResult> {
  const payload = await request<ApiEnvelope<DeleteDatabaseResult>>(`/api/v1/databases/${id}`, {
    method: 'DELETE',
  })

  return payload.data
}

export async function uploadDatabase(input: {
  file: File
  name?: string
  title?: string
  type?: string
}): Promise<PendingDatabase> {
  const formData = new FormData()
  formData.append('file', input.file)
  if (input.name) formData.append('name', input.name)
  if (input.title) formData.append('title', input.title)
  if (input.type) formData.append('type', input.type)

  const response = await fetch(buildApiUrl('/api/v1/databases'), {
    method: 'POST',
    body: formData,
  })

  const text = await response.text()
  const json = text ? JSON.parse(text) : null

  if (!response.ok) {
    const payload = json as ApiErrorPayload | null
    throw new ApiClientError(
      payload?.error?.message || `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code,
    )
  }

  return (json as ApiEnvelope<PendingDatabase>).data
}

export { ApiClientError }
