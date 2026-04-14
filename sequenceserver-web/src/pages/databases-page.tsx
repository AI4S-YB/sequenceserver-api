import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiClientError, createDatabase, createDatabaseIndex, deleteDatabase, fetchDatabases, uploadDatabase } from '../lib/api'
import { formatCount } from '../lib/job-results'
import type { Database, Job, PendingDatabase } from '../types/api'

type SourceMode = 'sequence' | 'upload' | 'local_path' | 'url' | 's3'

const sourceModeOptions: Array<{ value: SourceMode; label: string; helper: string }> = [
  { value: 'sequence', label: '直接输入序列', helper: '适合小规模 FASTA 文本，立即写入数据库目录。' },
  { value: 'upload', label: '上传文件', helper: '适合从浏览器提交 FASTA 文件。' },
  { value: 'local_path', label: '本机路径', helper: '适合与服务器上的其他程序联动，由后端直接读取本机文件。' },
  { value: 'url', label: '远程 URL', helper: '适合通过 HTTP/HTTPS 拉取远程 FASTA。' },
  { value: 's3', label: 'S3 地址', helper: '适合读取对象存储中的 FASTA，可用 s3:// 或预签名 https 地址。' },
]

function ResultSummary({
  created,
  manualIndexJob,
  onIndexCreated,
  onDeleteCreated,
  indexing,
  deleting,
}: {
  created: PendingDatabase | null
  manualIndexJob: Job | null
  onIndexCreated: () => void
  onDeleteCreated: () => void
  indexing: boolean
  deleting: boolean
}) {
  if (!created && !manualIndexJob) return null

  return (
    <div className="result-box">
      <h4>最近操作结果</h4>
      {created ? (
        <>
          <p>数据库标题：{created.title || '-'}</p>
          <p>数据库类型：{created.type || '-'}</p>
          <p>数据库标识：{created.id}</p>
          {created.index_job ? (
            <p>
              自动索引任务：
              <Link to={`/jobs/database/${created.index_job.id}`}> {created.index_job.id}</Link>
            </p>
          ) : (
            <>
              <p>自动索引任务：未创建，可手动点击“建立索引”。</p>
              <button className="secondary-button" disabled={indexing} onClick={onIndexCreated} type="button">
                {indexing ? '提交中...' : '建立索引'}
              </button>
              <button className="secondary-button" disabled={deleting} onClick={onDeleteCreated} type="button">
                {deleting ? '删除中...' : '删除该数据库'}
              </button>
            </>
          )}
        </>
      ) : null}

      {manualIndexJob ? (
        <p>
          手动索引任务：
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
}: {
  mode: SourceMode
  name: string
  sequence: string
  localPath: string
  remoteUrl: string
  s3Uri: string
  uploadFile: File | null
}): string {
  if (mode === 'sequence' && !name.trim()) {
    return '目标文件名不能为空。'
  }

  if (mode === 'sequence' && !sequence.trim()) {
    return 'FASTA 内容不能为空。'
  }

  if (mode === 'upload' && !uploadFile) {
    return '请选择要上传的 FASTA 文件。'
  }

  if (mode === 'local_path') {
    if (!localPath.trim()) return '本机路径不能为空。'
    if (!localPath.startsWith('/')) return '本机路径必须是绝对路径。'
  }

  if (mode === 'url') {
    if (!remoteUrl.trim()) return '远程 URL 不能为空。'
    if (!/^https?:\/\//.test(remoteUrl)) return '远程 URL 必须以 http:// 或 https:// 开头。'
  }

  if (mode === 's3') {
    if (!s3Uri.trim()) return 'S3 地址不能为空。'
    if (!/^s3:\/\//.test(s3Uri) && !/^https?:\/\//.test(s3Uri)) {
      return 'S3 地址必须是 s3://bucket/key 或预签名 https:// 地址。'
    }
  }

  return ''
}

function SourceGuide({ mode }: { mode: SourceMode }) {
  const current = sourceModeOptions.find((item) => item.value === mode)

  return (
    <div className="result-box">
      <h4>当前导入方式说明</h4>
      <p>{current?.helper}</p>
      {mode === 'local_path' ? <p>后端会读取服务器本机文件，且路径必须落在白名单目录内。</p> : null}
      {mode === 'url' ? <p>后端只允许白名单 URL 前缀，默认部署通常是关闭的。</p> : null}
      {mode === 's3' ? <p>后端只允许白名单 bucket 或预签名 URL 前缀，默认部署通常是关闭的。</p> : null}
      {mode === 'upload' ? <p>上传模式最适合当前未配置白名单时先跑通流程。</p> : null}
    </div>
  )
}

function DatabaseCard({
  database,
  deleting,
  onDelete,
  onIndex,
  indexing,
}: {
  database: Database
  deleting: boolean
  onDelete: (database: Database) => void
  onIndex: (database: Database) => void
  indexing: boolean
}) {
  return (
    <div className="list-item" key={database.id}>
      <strong>{database.title}</strong>
      <span>类型：{database.type}</span>
      <span>序列数：{formatCount(database.nsequences)}</span>
      <span>字符数：{formatCount(database.ncharacters)}</span>
      <code>{database.name}</code>
      <button className="secondary-button" disabled={indexing} onClick={() => onIndex(database)} type="button">
        {indexing ? '提交中...' : '建立索引'}
      </button>
      <button className="secondary-button danger-button" disabled={deleting} onClick={() => onDelete(database)} type="button">
        {deleting ? '删除中...' : '删除数据库'}
      </button>
    </div>
  )
}

export function DatabasesPage() {
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载数据库失败'))
      .finally(() => setLoading(false))
  }, [])

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
      }),
    [localPath, mode, name, remoteUrl, s3Uri, sequence, uploadFile],
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
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : '创建数据库失败')
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
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : '提交索引任务失败')
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
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : '提交索引任务失败')
    } finally {
      setIndexingId('')
    }
  }

  async function handleDeleteDatabase(database: { id: string; title?: string | null }) {
    const label = database.title || database.id
    if (!window.confirm(`确认删除数据库“${label}”？此操作会删除 FASTA 文件及其索引文件。`)) return

    setDeletingId(database.id)
    setError('')
    setMessage('')

    try {
      const result = await deleteDatabase(database.id)
      setMessage(`已删除数据库 ${label}，移除文件 ${result.removed_files.length} 个。`)
      if (created?.id === database.id) {
        setCreated(null)
        setManualIndexJob(null)
      }
      await loadDatabases()
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : '删除数据库失败')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">数据库管理</p>
        <h2>多来源数据库导入与索引</h2>
        <p className="page-copy">
          这一页围绕新 API 工作，既支持前端上传，也支持与服务器本机路径、URL、S3 来源联动。
        </p>
      </header>

      <div className="card-grid">
        <article className="card">
          <p className="metric-label">数据库数量</p>
          <strong className="metric-value">{formatCount(databases.length)}</strong>
          <p className="metric-helper">当前已扫描到的数据库</p>
        </article>
        <article className="card">
          <p className="metric-label">最近导入结果</p>
          <strong className="metric-value">{created ? '已提交' : '-'}</strong>
          <p className="metric-helper">成功创建后会在下方显示任务链接</p>
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>当前数据库</h3>
          {loading ? <p>加载中...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          {message ? <p className="success-text">{message}</p> : null}
          <div className="list">
            {databases.map((database) => (
              <DatabaseCard
                key={database.id}
                database={database}
                deleting={deletingId === database.id}
                onDelete={handleDeleteDatabase}
                indexing={indexingId === database.id}
                onIndex={handleIndex}
              />
            ))}
            {!loading && !databases.length ? <p>当前还没有数据库。</p> : null}
          </div>
        </article>

        <article className="panel">
          <h3>新建数据库</h3>
          <div className="mode-grid">
            {sourceModeOptions.map((option) => (
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
              <span>目标文件名</span>
              <input
                placeholder={
                  mode === 'sequence'
                    ? '例如 imports/example.fa'
                    : '可留空，系统会尽量从来源中推断文件名'
                }
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label>
              <span>数据库标题</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            {mode === 'sequence' ? (
              <label>
                <span>FASTA 内容</span>
                <textarea rows={8} value={sequence} onChange={(event) => setSequence(event.target.value)} />
              </label>
            ) : null}

            {mode === 'upload' ? (
              <label>
                <span>上传 FASTA 文件</span>
                <input
                  type="file"
                  accept=".fa,.fasta,.fna,.faa,text/plain"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                />
              </label>
            ) : null}

            {mode === 'local_path' ? (
              <label>
                <span>本机绝对路径</span>
                <input value={localPath} onChange={(event) => setLocalPath(event.target.value)} />
              </label>
            ) : null}

            {mode === 'url' ? (
              <label>
                <span>远程 URL</span>
                <input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} />
              </label>
            ) : null}

            {mode === 's3' ? (
              <label>
                <span>S3 / 预签名地址</span>
                <input value={s3Uri} onChange={(event) => setS3Uri(event.target.value)} />
              </label>
            ) : null}

            <label>
              <span>序列类型</span>
              <select value={sequenceType} onChange={(event) => setSequenceType(event.target.value)}>
                <option value="">自动判断</option>
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
                <span>导入后自动建立 BLAST 索引</span>
              </label>
            ) : null}

            {sourceValidationError ? <p className="error-text">{sourceValidationError}</p> : null}

            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? '提交中...' : '创建数据库'}
            </button>
          </form>

          <SourceGuide mode={mode} />
          <ResultSummary
            created={created}
            deleting={deletingId === created?.id}
            indexing={indexingId === created?.id}
            manualIndexJob={manualIndexJob}
            onDeleteCreated={() => created && handleDeleteDatabase({ id: created.id, title: created.title })}
            onIndexCreated={handleIndexCreated}
          />
        </article>
      </div>
    </section>
  )
}
