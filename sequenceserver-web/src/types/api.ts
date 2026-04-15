export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface Database {
  id: string
  name: string
  title: string
  type: string
  nsequences?: number
  ncharacters?: number
  updated_on?: string
  format?: string
  categories?: string[]
}

export interface JobLogUrls {
  stdout: string
  stderr: string
}

export interface BlastJobDownload {
  type: string
  label: string
  url: string
  extension: string
  mime: string
}

export interface BlastResultWarning {
  user_warning: 'LARGE_RESULT'
  warning_code?: string
  message: string
  detail?: string
  xml_file_size?: number
  threshold?: number
  bypass_parameter?: string
  bypass_value?: string
  download_links: BlastJobDownload[]
}

export interface BlastMethodOption {
  id: string
  label: string
  query_type: 'nucleotide' | 'protein'
  database_type: 'nucleotide' | 'protein'
  helper: string
  tasks: string[]
  default_attributes: string[]
  default_advanced: string
}

export interface BlastQueryExample {
  label: string
  query_type: 'nucleotide' | 'protein'
  sequence: string
}

export interface BlastFormConfig {
  databases: Database[]
  methods: BlastMethodOption[]
  options: Record<string, Record<string, { description?: string | null; attributes: string[] }>>
  blast_task_map: Record<string, string[]>
  query_examples: Partial<Record<string, BlastQueryExample>>
  database_tree?: unknown
}

export interface SequenceLookupError {
  title: string
  message: string
}

export interface SequenceEntry {
  id: string
  title: string
  value: string
  length: number
}

export interface SequenceLookupResult {
  sequence_ids: string[]
  database_ids: string[]
  sequence_count: number
  sequences: SequenceEntry[]
  error_msgs: SequenceLookupError[]
}

export interface Job {
  id: string
  kind: 'blast' | 'database_index'
  status: JobStatus
  submitted_at: string
  started_at?: string | null
  completed_at?: string | null
  title?: string | null
  database_id?: string | null
  method?: string | null
  databases?: Database[]
  result_url?: string | null
  log_urls?: JobLogUrls
  downloads?: BlastJobDownload[]
  exitstatus?: number
}

export interface BlastJobInput {
  id: string
  sequence: string
  method: string
  advanced: string
  databases: Database[]
  database_ids: string[]
  submitted_at?: string | null
}

export interface PendingDatabase {
  id: string
  name: string
  title?: string
  type?: string | null
  indexed: boolean
  index_job?: Job
}

export interface DeleteDatabaseResult {
  id: string
  name: string
  deleted: boolean
  removed_files: string[]
}

export interface JobLog {
  id: string
  stream: 'stdout' | 'stderr'
  content: string
}

export interface ApiEnvelope<T> {
  data: T
}

export interface ApiErrorPayload {
  error: {
    code: string
    message: string
  }
}
