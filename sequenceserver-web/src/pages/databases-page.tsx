import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiClientError, createDatabase, createDatabaseIndex, deleteDatabase, fetchDatabases, uploadDatabase } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { formatCount } from '../lib/job-results'
import type { Database, Job, PendingDatabase } from '../types/api'

type SourceMode = 'sequence' | 'upload' | 'local_path' | 'url' | 's3'

function sourceModeOptions(isChinese: boolean): Array<{ value: SourceMode; label: string; helper: string }> {
  return [
    {
      value: 'sequence',
      label: isChinese ? '直接输入序列' : 'Paste Sequence',
      helper: isChinese ? '适合小规模 FASTA 文本，立即写入数据库目录。' : 'Best for small FASTA text pasted directly into the database directory.',
    },
    {
      value: 'upload',
      label: isChinese ? '上传文件' : 'Upload File',
      helper: isChinese ? '适合从浏览器提交 FASTA 文件。' : 'Best for submitting a FASTA file from the browser.',
    },
    {
      value: 'local_path',
      label: isChinese ? '本机路径' : 'Local Path',
      helper: isChinese ? '适合与服务器上的其他程序联动，由后端直接读取本机文件。' : 'Best for integration with other server-side programs that pass a local file path.',
    },
    {
      value: 'url',
      label: isChinese ? '远程 URL' : 'Remote URL',
      helper: isChinese ? '适合通过 HTTP/HTTPS 拉取远程 FASTA。' : 'Best for fetching remote FASTA files over HTTP or HTTPS.',
    },
    {
      value: 's3',
      label: isChinese ? 'S3 地址' : 'S3 URI',
      helper: isChinese ? '适合读取对象存储中的 FASTA，可用 s3:// 或预签名 https 地址。' : 'Best for reading FASTA files from object storage using s3:// URIs or presigned HTTPS URLs.',
    },
  ]
}

function ResultSummary({
  created,
  manualIndexJob,
  onIndexCreated,
  onDeleteCreated,
  indexing,
  deleting,
  isChinese,
}: {
  created: PendingDatabase | null
  manualIndexJob: Job | null
  onIndexCreated: () => void
  onDeleteCreated: () => void
  indexing: boolean
  deleting: boolean
  isChinese: boolean
}) {
  const { t } = useI18n()
  if (!created && !manualIndexJob) return null

  return (
    <div className="result-box">
      <h4>{isChinese ? '最近操作结果' : 'Latest Action Result'}</h4>
      {created ? (
        <>
          <p>{isChinese ? '数据库标题' : 'Database Title'}：{created.title || '-'}</p>
          <p>{isChinese ? '数据库类型' : 'Database Type'}：{created.type || '-'}</p>
          <p>{isChinese ? '数据库标识' : 'Database ID'}：{created.id}</p>
          {created.index_job ? (
            <p>
              {isChinese ? '自动索引任务' : 'Automatic Index Job'}：
              <Link to={`/jobs/database/${created.index_job.id}`}> {created.index_job.id}</Link>
            </p>
          ) : (
            <>
              <p>{isChinese ? '自动索引任务：未创建，可手动点击“建立索引”。' : 'Automatic index job was not created. You can build the index manually.'}</p>
              <button className="secondary-button" disabled={indexing} onClick={onIndexCreated} type="button">
                {indexing ? t('databases.submitting') : t('databases.index')}
              </button>
              <button className="secondary-button" disabled={deleting} onClick={onDeleteCreated} type="button">
                {deleting ? t('databases.deleting') : t('databases.delete')}
              </button>
            </>
          )}
        </>
      ) : null}

      {manualIndexJob ? (
        <p>
          {isChinese ? '手动索引任务' : 'Manual Index Job'}：
          <Link to={`/jobs/database/${manualIndexJob.id}`}> {manualIndexJob.id}</Link>
        </p>
      ) : null}
    </div>
  )
}

function validateSource({
  mode,
  name,
  sequence,
  localPath,
  remoteUrl,
  s3Uri,
  uploadFile,
  isChinese,
}: {
  mode: SourceMode
  name: string
  sequence: string
  localPath: string
  remoteUrl: string
  s3Uri: string
  uploadFile: File | null
  isChinese: boolean
}): string {
  if (mode === 'sequence' && !name.trim()) {
    return isChinese ? '目标文件名不能为空。' : 'Target filename cannot be empty.'
  }

  if (mode === 'sequence' && !sequence.trim()) {
    return isChinese ? 'FASTA 内容不能为空。' : 'FASTA content cannot be empty.'
  }

  if (mode === 'upload' && !uploadFile) {
    return isChinese ? '请选择要上传的 FASTA 文件。' : 'Select a FASTA file to upload.'
  }

  if (mode === 'local_path') {
    if (!localPath.trim()) return isChinese ? '本机路径不能为空。' : 'Local path cannot be empty.'
    if (!localPath.startsWith('/')) return isChinese ? '本机路径必须是绝对路径。' : 'Local path must be an absolute path.'
  }

  if (mode === 'url') {
    if (!remoteUrl.trim()) return isChinese ? '远程 URL 不能为空。' : 'Remote URL cannot be empty.'
    if (!/^https?:\/\//.test(remoteUrl)) return isChinese ? '远程 URL 必须以 http:// 或 https:// 开头。' : 'Remote URL must start with http:// or https://.'
  }

  if (mode === 's3') {
    if (!s3Uri.trim()) return isChinese ? 'S3 地址不能为空。' : 'S3 URI cannot be empty.'
    if (!/^s3:\/\//.test(s3Uri) && !/^https?:\/\//.test(s3Uri)) {
      return isChinese ? 'S3 地址必须是 s3://bucket/key 或预签名 https:// 地址。' : 'S3 source must be an s3://bucket/key URI or a presigned https:// URL.'
    }
  }

  return ''
}

function SourceGuide({ mode, isChinese }: { mode: SourceMode; isChinese: boolean }) {
  const current = sourceModeOptions(isChinese).find((item) => item.value === mode)

  return (
    <div className="result-box">
      <h4>{isChinese ? '当前导入方式说明' : 'Current Import Mode'}</h4>
      <p>{current?.helper}</p>
      {mode === 'local_path' ? <p>{isChinese ? '后端会读取服务器本机文件，且路径必须落在白名单目录内。' : 'The backend reads a local server file directly, and the path must fall within an allowed whitelist directory.'}</p> : null}
      {mode === 'url' ? <p>{isChinese ? '后端只允许白名单 URL 前缀，默认部署通常是关闭的。' : 'The backend only accepts allowlisted URL prefixes, and this is usually disabled by default.'}</p> : null}
      {mode === 's3' ? <p>{isChinese ? '后端只允许白名单 bucket 或预签名 URL 前缀，默认部署通常是关闭的。' : 'The backend only accepts allowlisted buckets or presigned URL prefixes, and this is usually disabled by default.'}</p> : null}
      {mode === 'upload' ? <p>{isChinese ? '上传模式最适合当前未配置白名单时先跑通流程。' : 'Upload mode is the best way to verify the workflow before whitelist resources are configured.'}</p> : null}
    </div>
  )
}

function DatabaseCard({
  database,
  deleting,
  onDelete,
  onIndex,
  indexing,
  isChinese,
}: {
  database: Database
  deleting: boolean
  onDelete: (database: Database) => void
  onIndex: (database: Database) => void
  indexing: boolean
  isChinese: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="list-item" key={database.id}>
      <strong>{database.title}</strong>
      <span>{isChinese ? '类型' : 'Type'}：{database.type}</span>
      <span>{isChinese ? '序列数' : 'Sequences'}：{formatCount(database.nsequences)}</span>
      <span>{isChinese ? '字符数' : 'Characters'}：{formatCount(database.ncharacters)}</span>
      <code>{database.name}</code>
      <button className="secondary-button" disabled={indexing} onClick={() => onIndex(database)} type="button">
        {indexing ? t('databases.submitting') : t('databases.index')}
      </button>
      <button className="secondary-button danger-button" disabled={deleting} onClick={() => onDelete(database)} type="button">
        {deleting ? t('databases.deleting') : t('databases.delete')}
      </button>
    </div>
  )
}

export function DatabasesPage() {
  const { t, isChinese } = useI18n()
  const [databases, setDatabases] = useState<Database[]>([])
  const [created, setCreated] = useState<PendingDatabase | null>(null)
  const [manualIndexJob, setManualIndexJob] = useState<Job | null>(null)
  const [error, setError] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [indexingId, setIndexingId] = useState('')
  const [deletingId, setDeletingId] = useState('')

  const [mode, setMode] = useState<SourceMode>('sequence')
  const [name, setName] = useState('imports/example.fa')
  const [title, setTitle] = useState('Example Import')
  const [sequenceType, setSequenceType] = useState('')
  const [taxid, setTaxid] = useState('0')
  const [autoIndex, setAutoIndex] = useState(true)

  const [sequence, setSequence] = useState('>seq1\nACTGACTGACTG')
  const [localPath, setLocalPath] = useState('/data/example.fa')
  const [remoteUrl, setRemoteUrl] = useState('https://example.com/demo.fa')
  const [s3Uri, setS3Uri] = useState('s3://my-bucket/demo.fa')
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  async function loadDatabases() {
    const items = await fetchDatabases()
    setDatabases(items)
  }

  useEffect(() => {
    loadDatabases()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : (isChinese ? '加载数据库失败' : 'Failed to load databases')))
      .finally(() => setLoading(false))
  }, [isChinese])

  const sourceValidationError = useMemo(
    () =>
      validateSource({
        mode,
        name,
        sequence,
        localPath,
        remoteUrl,
        s3Uri,
        uploadFile,
        isChinese,
      }),
    [isChinese, localPath, mode, name, remoteUrl, s3Uri, sequence, uploadFile],
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    setCreated(null)
    setManualIndexJob(null)

    if (sourceValidationError) {
      setError(sourceValidationError)
      setSubmitting(false)
      return
    }

    try {
      let result: PendingDatabase

      if (mode === 'upload') {
        result = await uploadDatabase({
          file: uploadFile as File,
          name: name.trim() || undefined,
          title: title.trim() || undefined,
          type: sequenceType || undefined,
        })
      } else {
        const payload: Parameters<typeof createDatabase>[0] = {
          name: name.trim(),
          title: title.trim() || undefined,
          type: sequenceType || undefined,
          auto_index: autoIndex,
          taxid: Number(taxid || '0'),
        }

        if (mode === 'sequence') payload.sequence = sequence
        if (mode === 'local_path') payload.source = { type: 'local_path', path: localPath.trim() }
        if (mode === 'url') payload.source = { type: 'url', uri: remoteUrl.trim() }
        if (mode === 's3') payload.source = { type: 's3', uri: s3Uri.trim() }

        result = await createDatabase(payload)
      }

      setCreated(result)
      await loadDatabases()
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : (isChinese ? '创建数据库失败' : 'Failed to create the database'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleIndex(database: Database) {
    setIndexingId(database.id)
    setError('')
    setMessage('')
    setManualIndexJob(null)

    try {
      const job = await createDatabaseIndex(database.id, {
        title: database.title,
        type: database.type,
        taxid: Number(taxid || '0'),
      })
      setManualIndexJob(job)
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : (isChinese ? '提交索引任务失败' : 'Failed to submit the indexing job'))
    } finally {
      setIndexingId('')
    }
  }

  async function handleIndexCreated() {
    if (!created) return

    setIndexingId(created.id)
    setError('')
    setMessage('')
    setManualIndexJob(null)

    try {
      const job = await createDatabaseIndex(created.id, {
        title: created.title,
        type: created.type || undefined,
        taxid: Number(taxid || '0'),
      })
      setManualIndexJob(job)
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : (isChinese ? '提交索引任务失败' : 'Failed to submit the indexing job'))
    } finally {
      setIndexingId('')
    }
  }

  async function handleDeleteDatabase(database: { id: string; title?: string | null }) {
    const label = database.title || database.id
    if (!window.confirm(isChinese ? `确认删除数据库“${label}”？此操作会删除 FASTA 文件及其索引文件。` : `Delete database "${label}"? This will remove the FASTA file and its index files.`)) return

    setDeletingId(database.id)
    setError('')
    setMessage('')

    try {
      const result = await deleteDatabase(database.id)
      setMessage(isChinese ? `已删除数据库 ${label}，移除文件 ${result.removed_files.length} 个。` : `Deleted database ${label}; removed ${result.removed_files.length} files.`)
      if (created?.id === database.id) {
        setCreated(null)
        setManualIndexJob(null)
      }
      await loadDatabases()
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : (isChinese ? '删除数据库失败' : 'Failed to delete the database'))
    } finally {
      setDeletingId('')
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">{t('databases.eyebrow')}</p>
        <h2>{t('databases.title')}</h2>
        <p className="page-copy">{t('databases.copy')}</p>
      </header>

      <div className="card-grid">
        <article className="card">
          <p className="metric-label">{t('databases.metric.count')}</p>
          <strong className="metric-value">{formatCount(databases.length)}</strong>
          <p className="metric-helper">{t('databases.metric.countHelper')}</p>
        </article>
        <article className="card">
          <p className="metric-label">{t('databases.metric.recent')}</p>
          <strong className="metric-value">{created ? (isChinese ? '已提交' : 'Submitted') : '-'}</strong>
          <p className="metric-helper">{t('databases.metric.recentHelper')}</p>
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>{t('databases.current')}</h3>
          {loading ? <p>{t('databases.loading')}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}
          <div className="list">
            {databases.map((database) => (
              <DatabaseCard
                key={database.id}
                database={database}
                deleting={deletingId === database.id}
                isChinese={isChinese}
                onDelete={handleDeleteDatabase}
                indexing={indexingId === database.id}
                onIndex={handleIndex}
              />
            ))}
            {!loading && !databases.length ? <p>{t('databases.none')}</p> : null}
          </div>
        </article>

        <article className="panel">
          <h3>{t('databases.create')}</h3>
          <div className="mode-grid">
            {sourceModeOptions(isChinese).map((option) => (
              <button
                key={option.value}
                className={mode === option.value ? 'secondary-button active' : 'secondary-button'}
                onClick={() => setMode(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              <span>{isChinese ? '目标文件名' : 'Target Filename'}</span>
              <input
                placeholder={
                  mode === 'sequence'
                    ? (isChinese ? '例如 imports/example.fa' : 'For example: imports/example.fa')
                    : (isChinese ? '可留空，系统会尽量从来源中推断文件名' : 'Optional. The system will infer a filename from the source when possible.')
                }
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label>
              <span>{isChinese ? '数据库标题' : 'Database Title'}</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            {mode === 'sequence' ? (
              <label>
                <span>{isChinese ? 'FASTA 内容' : 'FASTA Content'}</span>
                <textarea rows={8} value={sequence} onChange={(event) => setSequence(event.target.value)} />
              </label>
            ) : null}

            {mode === 'upload' ? (
              <label>
                <span>{isChinese ? '上传 FASTA 文件' : 'Upload FASTA File'}</span>
                <input
                  type="file"
                  accept=".fa,.fasta,.fna,.faa,text/plain"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                />
              </label>
            ) : null}

            {mode === 'local_path' ? (
              <label>
                <span>{isChinese ? '本机绝对路径' : 'Local Absolute Path'}</span>
                <input value={localPath} onChange={(event) => setLocalPath(event.target.value)} />
              </label>
            ) : null}

            {mode === 'url' ? (
              <label>
                <span>{isChinese ? '远程 URL' : 'Remote URL'}</span>
                <input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} />
              </label>
            ) : null}

            {mode === 's3' ? (
              <label>
                <span>{isChinese ? 'S3 / 预签名地址' : 'S3 / Presigned URL'}</span>
                <input value={s3Uri} onChange={(event) => setS3Uri(event.target.value)} />
              </label>
            ) : null}

            <label>
              <span>{isChinese ? '序列类型' : 'Sequence Type'}</span>
              <select value={sequenceType} onChange={(event) => setSequenceType(event.target.value)}>
                <option value="">{isChinese ? '自动判断' : 'Auto Detect'}</option>
                <option value="nucleotide">nucleotide</option>
                <option value="protein">protein</option>
              </select>
            </label>

            <label>
              <span>TaxID</span>
              <input value={taxid} onChange={(event) => setTaxid(event.target.value)} />
            </label>

            {mode !== 'upload' ? (
              <label className="checkbox-row">
                <input checked={autoIndex} type="checkbox" onChange={(event) => setAutoIndex(event.target.checked)} />
                <span>{isChinese ? '导入后自动建立 BLAST 索引' : 'Automatically build the BLAST index after import'}</span>
              </label>
            ) : null}

            {sourceValidationError ? <p className="error-text">{sourceValidationError}</p> : null}

            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? t('databases.submitting') : t('databases.submit')}
            </button>
          </form>

          <SourceGuide isChinese={isChinese} mode={mode} />
          <ResultSummary
            created={created}
            deleting={deletingId === created?.id}
            indexing={indexingId === created?.id}
            isChinese={isChinese}
            manualIndexJob={manualIndexJob}
            onDeleteCreated={() => created && handleDeleteDatabase({ id: created.id, title: created.title })}
            onIndexCreated={handleIndexCreated}
          />
        </article>
      </div>
    </section>
  )
}
