import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl, fetchBlastJobs, fetchDatabaseJobs } from '../lib/api'
import { formatCount } from '../lib/job-results'
import type { Job, JobStatus } from '../types/api'

type JobTab = 'blast' | 'database_index'

const statusOptions: Array<{ value: '' | JobStatus; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'queued', label: 'queued' },
  { value: 'running', label: 'running' },
  { value: 'succeeded', label: 'succeeded' },
  { value: 'failed', label: 'failed' },
  { value: 'cancelled', label: 'cancelled' },
]

const limitOptions = [20, 50, 100] as const

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="card">
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
    </article>
  )
}

function JobRow({ job }: { job: Job }) {
  const to = job.kind === 'blast' ? `/jobs/blast/${job.id}` : `/jobs/database/${job.id}`
  const isFailed = job.status === 'failed' || job.status === 'cancelled'
  const isRunning = job.status === 'running' || job.status === 'queued'
  const resultUrl = job.result_url ? buildApiUrl(job.result_url) : ''
  const stdoutUrl = job.log_urls?.stdout ? buildApiUrl(job.log_urls.stdout) : ''
  const stderrUrl = job.log_urls?.stderr ? buildApiUrl(job.log_urls.stderr) : ''

  return (
    <div
      className={`list-item ${isFailed ? 'list-item-warning' : ''} ${isRunning ? 'list-item-active' : ''}`}
      key={job.id}
    >
      <div className="job-row-header">
        <strong>
          <Link to={to}>{job.id}</Link>
        </strong>
        <div className="inline-actions">
          <Link className="secondary-button action-link" to={to}>
            查看详情
          </Link>
          {resultUrl ? (
            <a className="secondary-button action-link" href={resultUrl} rel="noreferrer" target="_blank">
              打开结果接口
            </a>
          ) : null}
          {stdoutUrl ? (
            <a className="secondary-button action-link" href={stdoutUrl} rel="noreferrer" target="_blank">
              stdout
            </a>
          ) : null}
          {stderrUrl ? (
            <a className="secondary-button action-link" href={stderrUrl} rel="noreferrer" target="_blank">
              stderr
            </a>
          ) : null}
        </div>
      </div>
      <span>状态：{job.status}</span>
      <span>类型：{job.kind}</span>
      {job.title ? <span>标题：{job.title}</span> : null}
      {job.method ? <span>方法：{job.method}</span> : null}
      {job.database_id ? <span>数据库 ID：{job.database_id}</span> : null}
      {job.submitted_at ? <span>提交时间：{job.submitted_at}</span> : null}
      {job.started_at ? <span>开始时间：{job.started_at}</span> : null}
      {job.completed_at ? <span>完成时间：{job.completed_at}</span> : null}
      {typeof job.exitstatus === 'number' ? <span>退出码：{job.exitstatus}</span> : null}
      <code>{job.result_url || '结果未就绪'}</code>
    </div>
  )
}

function matchesKeyword(job: Job, keyword: string): boolean {
  if (!keyword) return true

  const haystacks = [
    job.id,
    job.kind,
    job.status,
    job.title || '',
    job.method || '',
    job.database_id || '',
    job.result_url || '',
    ...(job.databases || []).flatMap((database) => [database.id, database.title, database.name]),
  ]

  return haystacks.some((value) => value.toLowerCase().includes(keyword))
}

export function JobsPage() {
  const [tab, setTab] = useState<JobTab>('blast')
  const [status, setStatus] = useState<'' | JobStatus>('')
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState<number>(50)
  const [blastJobs, setBlastJobs] = useState<Job[]>([])
  const [databaseJobs, setDatabaseJobs] = useState<Job[]>([])
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastLoadedAt, setLastLoadedAt] = useState<string>('')

  const loadJobs = useCallback(async () => {
    setRefreshing(true)
    setError('')

    try {
      const [blast, database] = await Promise.all([
        fetchBlastJobs({ limit, status: status || undefined }),
        fetchDatabaseJobs({ limit, status: status || undefined }),
      ])
      setBlastJobs(blast)
      setDatabaseJobs(database)
      setLastLoadedAt(new Date().toLocaleString('zh-CN'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载任务失败')
    } finally {
      setRefreshing(false)
    }
  }, [limit, status])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  useEffect(() => {
    if (!autoRefresh) return

    const timer = window.setInterval(() => {
      loadJobs()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [autoRefresh, loadJobs])

  const keywordFilter = keyword.trim().toLowerCase()

  const currentJobs = useMemo(() => {
    const source = tab === 'blast' ? blastJobs : databaseJobs
    return source.filter((job) => matchesKeyword(job, keywordFilter))
  }, [blastJobs, databaseJobs, keywordFilter, tab])

  const stats = useMemo(() => {
    const all = [...blastJobs, ...databaseJobs]
    return {
      total: all.length,
      running: all.filter((job) => job.status === 'running').length,
      queued: all.filter((job) => job.status === 'queued').length,
      failed: all.filter((job) => job.status === 'failed' || job.status === 'cancelled').length,
    }
  }, [blastJobs, databaseJobs])

  const failedJobs = useMemo(() => {
    return [...blastJobs, ...databaseJobs]
      .filter((job) => job.status === 'failed' || job.status === 'cancelled')
      .slice(0, 5)
  }, [blastJobs, databaseJobs])

  const activeJobs = useMemo(() => {
    return [...blastJobs, ...databaseJobs]
      .filter((job) => job.status === 'running' || job.status === 'queued')
      .slice(0, 5)
  }, [blastJobs, databaseJobs])

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">任务中心</p>
        <h2>任务工作台</h2>
        <p className="page-copy">
          这里用于集中查看 BLAST 与数据库索引任务，并继续向“任务运维台”演进。
        </p>
      </header>

      <div className="card-grid">
        <StatCard label="任务总数" value={stats.total} />
        <StatCard label="运行中" value={stats.running} />
        <StatCard label="排队中" value={stats.queued} />
        <StatCard label="失败任务" value={stats.failed} />
      </div>

      <article className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <button
              className={tab === 'blast' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setTab('blast')}
              type="button"
            >
              BLAST 任务
            </button>
            <button
              className={tab === 'database_index' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setTab('database_index')}
              type="button"
            >
              数据库索引任务
            </button>
          </div>

          <div className="toolbar-group">
            <label className="inline-toggle">
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
              <span>自动刷新</span>
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as '' | JobStatus)}>
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  最近 {option} 条
                </option>
              ))}
            </select>
            <button className="primary-button" disabled={refreshing} onClick={loadJobs} type="button">
              {refreshing ? '刷新中...' : '刷新'}
            </button>
          </div>
        </div>

        <label className="filter-field">
          <span>关键词检索</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="按任务 ID、标题、方法、数据库 ID、数据库标题筛选"
          />
        </label>

        <p className="toolbar-note">
          最近刷新时间：{lastLoadedAt || '尚未完成首次加载'}
          {autoRefresh ? '，每 5 秒自动同步一次。' : '，当前为手动刷新模式。'}
          {` 当前列表显示 ${formatCount(currentJobs.length)} 条任务。`}
        </p>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="list">
          {currentJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
          {!currentJobs.length && !error ? <p>当前筛选条件下没有任务。</p> : null}
        </div>
      </article>

      <article className="panel">
        <h3>最近失败 / 已取消任务</h3>
        <div className="list">
          {failedJobs.map((job) => (
            <JobRow key={`failed-${job.id}`} job={job} />
          ))}
          {!failedJobs.length ? <p>当前没有失败或已取消的任务。</p> : null}
        </div>
      </article>

      <article className="panel">
        <h3>最近活跃任务</h3>
        <p className="toolbar-note">这里优先显示排队中和运行中的任务，便于值守时快速观察。</p>
        <div className="list">
          {activeJobs.map((job) => (
            <JobRow key={`active-${job.id}`} job={job} />
          ))}
          {!activeJobs.length ? <p>当前没有排队中或运行中的任务。</p> : null}
        </div>
      </article>
    </section>
  )
}
