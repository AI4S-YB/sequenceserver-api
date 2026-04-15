import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl, fetchBlastJobs, fetchDatabaseJobs } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { formatCount } from '../lib/job-results'
import type { Job, JobStatus } from '../types/api'

type JobTab = 'blast' | 'database_index'

function statusOptions(isChinese: boolean): Array<{ value: '' | JobStatus; label: string }> {
  return [
    { value: '', label: isChinese ? '全部状态' : 'All Statuses' },
    { value: 'queued', label: isChinese ? '排队中' : 'Queued' },
    { value: 'running', label: isChinese ? '运行中' : 'Running' },
    { value: 'succeeded', label: isChinese ? '已完成' : 'Succeeded' },
    { value: 'failed', label: isChinese ? '失败' : 'Failed' },
    { value: 'cancelled', label: isChinese ? '已取消' : 'Cancelled' },
  ]
}

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
  const { t, isChinese } = useI18n()
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
            {t('jobs.viewDetail')}
          </Link>
          {resultUrl ? (
            <a className="secondary-button action-link" href={resultUrl} rel="noreferrer" target="_blank">
              {t('jobs.openResultApi')}
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
      <span>{isChinese ? '状态' : 'Status'}：{job.status}</span>
      <span>{isChinese ? '类型' : 'Kind'}：{job.kind}</span>
      {job.title ? <span>{isChinese ? '标题' : 'Title'}：{job.title}</span> : null}
      {job.method ? <span>{isChinese ? '方法' : 'Method'}：{job.method}</span> : null}
      {job.database_id ? <span>{isChinese ? '数据库 ID' : 'Database ID'}：{job.database_id}</span> : null}
      {job.submitted_at ? <span>{isChinese ? '提交时间' : 'Submitted At'}：{job.submitted_at}</span> : null}
      {job.started_at ? <span>{isChinese ? '开始时间' : 'Started At'}：{job.started_at}</span> : null}
      {job.completed_at ? <span>{isChinese ? '完成时间' : 'Completed At'}：{job.completed_at}</span> : null}
      {typeof job.exitstatus === 'number' ? <span>{isChinese ? '退出码' : 'Exit Code'}：{job.exitstatus}</span> : null}
      <code>{job.result_url || (isChinese ? '结果未就绪' : 'Result not ready')}</code>
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
  const { t, isChinese } = useI18n()
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
      setLastLoadedAt(new Date().toLocaleString(isChinese ? 'zh-CN' : 'en-US'))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isChinese ? '加载任务失败' : 'Failed to load jobs'))
    } finally {
      setRefreshing(false)
    }
  }, [isChinese, limit, status])

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
        <p className="eyebrow">{t('jobs.eyebrow')}</p>
        <h2>{t('jobs.title')}</h2>
        <p className="page-copy">{t('jobs.copy')}</p>
      </header>

      <div className="card-grid">
        <StatCard label={t('jobs.total')} value={stats.total} />
        <StatCard label={t('jobs.running')} value={stats.running} />
        <StatCard label={t('jobs.queued')} value={stats.queued} />
        <StatCard label={t('jobs.failed')} value={stats.failed} />
      </div>

      <article className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <button
              className={tab === 'blast' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setTab('blast')}
              type="button"
            >
              {t('jobs.blastTab')}
            </button>
            <button
              className={tab === 'database_index' ? 'secondary-button active' : 'secondary-button'}
              onClick={() => setTab('database_index')}
              type="button"
            >
              {t('jobs.databaseTab')}
            </button>
          </div>

          <div className="toolbar-group">
            <label className="inline-toggle">
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
              <span>{t('jobs.autoRefresh')}</span>
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as '' | JobStatus)}>
              {statusOptions(isChinese).map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
              {limitOptions.map((option) => (
                <option key={option} value={option}>
                  {isChinese ? `最近 ${option} 条` : `Last ${option}`}
                </option>
              ))}
            </select>
            <button className="primary-button" disabled={refreshing} onClick={loadJobs} type="button">
              {refreshing ? t('jobs.refreshing') : t('jobs.refresh')}
            </button>
          </div>
        </div>

        <label className="filter-field">
          <span>{t('jobs.keyword')}</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('jobs.keywordPlaceholder')}
          />
        </label>

        <p className="toolbar-note">
          {isChinese
            ? `最近刷新时间：${lastLoadedAt || '尚未完成首次加载'}${autoRefresh ? '，每 5 秒自动同步一次。' : '，当前为手动刷新模式。'} 当前列表显示 ${formatCount(currentJobs.length)} 条任务。`
            : `Last refreshed: ${lastLoadedAt || 'not loaded yet'}${autoRefresh ? ', auto refresh every 5 seconds.' : ', manual refresh mode.'} Showing ${formatCount(currentJobs.length)} jobs.`}
        </p>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="list">
          {currentJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
          {!currentJobs.length && !error ? <p>{t('jobs.none')}</p> : null}
        </div>
      </article>

      <article className="panel">
        <h3>{t('jobs.failedSection')}</h3>
        <div className="list">
          {failedJobs.map((job) => (
            <JobRow key={`failed-${job.id}`} job={job} />
          ))}
          {!failedJobs.length ? <p>{t('jobs.noneFailed')}</p> : null}
        </div>
      </article>

      <article className="panel">
        <h3>{t('jobs.activeSection')}</h3>
        <p className="toolbar-note">{t('jobs.activeHelper')}</p>
        <div className="list">
          {activeJobs.map((job) => (
            <JobRow key={`active-${job.id}`} job={job} />
          ))}
          {!activeJobs.length ? <p>{t('jobs.noneActive')}</p> : null}
        </div>
      </article>
    </section>
  )
}
