import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleSection } from '../components/collapsible-section'
import { Link, useParams } from 'react-router-dom'
import { ApiClientError, buildApiUrl, cancelDatabaseJob, fetchDatabaseJob, fetchDatabaseJobLog, fetchDatabaseJobResult } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { formatCount, summarizeDatabaseResult } from '../lib/job-results'
import type { Job, JobLog } from '../types/api'

function usePolling(enabled: boolean, callback: () => void) {
  useEffect(() => {
    if (!enabled) return

    callback()
    const timer = window.setInterval(callback, 3000)
    return () => window.clearInterval(timer)
  }, [enabled, callback])
}

function summarizeLog(log?: JobLog | null, isChinese = true): string {
  if (!log?.content) return isChinese ? '暂无日志摘要。' : 'No log summary.'

  const lines = log.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.slice(-3).join(' | ') || (isChinese ? '暂无日志摘要。' : 'No log summary.')
}

export function DatabaseJobDetailPage() {
  const { t, isChinese } = useI18n()
  const { id = '' } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [stdoutLog, setStdoutLog] = useState<JobLog | null>(null)
  const [stderrLog, setStderrLog] = useState<JobLog | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastLoadedAt, setLastLoadedAt] = useState('')

  const pollingEnabled = useMemo(
    () => autoRefresh && (job?.status === 'queued' || job?.status === 'running'),
    [autoRefresh, job?.status],
  )
  const summary = useMemo(() => summarizeDatabaseResult(result), [result])
  const resultApiUrl = useMemo(() => (job?.result_url ? buildApiUrl(job.result_url) : ''), [job?.result_url])
  const stdoutApiUrl = useMemo(() => (job?.log_urls?.stdout ? buildApiUrl(job.log_urls.stdout) : ''), [job?.log_urls?.stdout])
  const stderrApiUrl = useMemo(() => (job?.log_urls?.stderr ? buildApiUrl(job.log_urls.stderr) : ''), [job?.log_urls?.stderr])

  const loadLogs = useCallback(async () => {
    const [stdout, stderr] = await Promise.all([
      fetchDatabaseJobLog(id, 'stdout').catch(() => null),
      fetchDatabaseJobLog(id, 'stderr').catch(() => null),
    ])
    setStdoutLog(stdout)
    setStderrLog(stderr)
  }, [id])

  const loadJob = useCallback(async () => {
    setRefreshing(true)
    try {
      setError('')
      const loaded = await fetchDatabaseJob(id)
      setJob(loaded)
      await loadLogs()
      if (loaded.status === 'succeeded') {
        const data = await fetchDatabaseJobResult(id)
        setResult(data)
      } else {
        setResult(null)
      }
      setLastLoadedAt(new Date().toLocaleString(isChinese ? 'zh-CN' : 'en-US'))
    } catch (err) {
      setError(err instanceof Error ? err.message : isChinese ? '加载任务详情失败' : 'Failed to load job details')
    } finally {
      setRefreshing(false)
    }
  }, [id, isChinese, loadLogs])

  usePolling(Boolean(id) && pollingEnabled, loadJob)

  useEffect(() => {
    loadJob()
  }, [id, loadJob])

  async function handleCancel() {
    try {
      const cancelled = await cancelDatabaseJob(id)
      setJob(cancelled)
      await loadLogs()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : isChinese ? '取消任务失败' : 'Failed to cancel job')
    }
  }

  const statusTone =
    job?.status === 'failed' || job?.status === 'cancelled'
      ? 'status-panel status-panel-warning'
      : job?.status === 'succeeded'
        ? 'status-panel status-panel-success'
        : 'status-panel'

  const statusMessage = useMemo(() => {
    if (!job) return isChinese ? '正在加载任务信息。' : 'Loading job details.'
    if (job.status === 'queued') return isChinese ? '索引任务已进入队列，页面会按设置自动刷新。' : 'The indexing job is queued and will refresh automatically.'
    if (job.status === 'running') return isChinese ? '索引任务正在运行，可通过日志观察 makeblastdb 执行进度。' : 'The indexing job is running. Check the logs for makeblastdb progress.'
    if (job.status === 'succeeded') return isChinese ? '索引任务已成功完成，数据库元数据已可查看。' : 'The indexing job completed successfully and database metadata is available.'
    if (job.status === 'cancelled') return isChinese ? `索引任务已取消。${summarizeLog(stderrLog, true)}` : `The indexing job was cancelled. ${summarizeLog(stderrLog, false)}`
    if (job.status === 'failed') return isChinese ? `索引任务执行失败。${summarizeLog(stderrLog, true)}` : `The indexing job failed. ${summarizeLog(stderrLog, false)}`
    return isChinese ? '任务状态未知。' : 'Unknown job status.'
  }, [isChinese, job, stderrLog])

  const failureHints = useMemo(() => {
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return []

    const stderr = stderrLog?.content || ''
    const stdout = stdoutLog?.content || ''
    const combined = `${stderr}\n${stdout}`.toLowerCase()
    const hints: string[] = []

    if (combined.includes('permission denied')) {
      hints.push(isChinese ? '检测到权限不足，优先检查数据库目录和输出目录的写权限。' : 'Permission issues detected. Check write access to the database and output directories.')
    }
    if (combined.includes('no space left') || combined.includes('not enough disk space')) {
      hints.push(isChinese ? '检测到磁盘空间不足，需要先清理目标磁盘后再重试。' : 'Disk space appears insufficient. Free space and retry.')
    }
    if (combined.includes('taxid') || combined.includes('taxonomy')) {
      hints.push(isChinese ? '日志里出现 taxid/taxonomy 相关信息，建议核对 taxid 参数和本地 taxonomy 数据。' : 'Taxid or taxonomy-related messages were detected. Check the taxid parameter and local taxonomy data.')
    }
    if (combined.includes('invalid') && combined.includes('fasta')) {
      hints.push(isChinese ? '日志里出现 FASTA 格式异常，建议检查序列头和文件编码。' : 'Potential FASTA formatting issues were detected. Check headers and file encoding.')
    }
    if (job.status === 'cancelled') {
      hints.push(isChinese ? '该任务是人工取消，不一定代表数据库文件本身有问题。' : 'The job was cancelled manually and the database file itself may still be fine.')
    }

    return hints
  }, [isChinese, job, stderrLog?.content, stdoutLog?.content])

  const nextActions = useMemo(() => {
    if (!job) return []

    if (job.status === 'succeeded') {
      return [
        { label: isChinese ? '返回数据库管理' : 'Back to Databases', to: '/databases', helper: isChinese ? '查看新索引数据库是否已出现在列表中。' : 'Check whether the newly indexed database is now listed.' },
        { label: isChinese ? '去提交 BLAST' : 'Run BLAST', to: '/blast/new', helper: isChinese ? '基于新数据库直接发起一次检索。' : 'Start a search directly with the new database.' },
        { label: isChinese ? '返回任务中心' : 'Back to Jobs', to: '/jobs', helper: isChinese ? '继续查看其他任务状态。' : 'Continue reviewing other job states.' },
      ]
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      return [
        { label: isChinese ? '返回数据库页面' : 'Back to Databases', to: '/databases', helper: isChinese ? '检查原始 FASTA、路径和导入方式。' : 'Check the original FASTA, path, and import method.' },
        { label: isChinese ? '返回任务中心' : 'Back to Jobs', to: '/jobs', helper: isChinese ? '切回任务列表继续排查其他任务。' : 'Go back to the job list and continue troubleshooting.' },
      ]
    }

    return [{ label: isChinese ? '返回任务中心' : 'Back to Jobs', to: '/jobs', helper: isChinese ? '查看队列里的其他任务。' : 'Inspect other jobs in the queue.' }]
  }, [isChinese, job])

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">{t('databaseDetail.eyebrow')}</p>
        <h2>{id}</h2>
        <p className="page-copy">{t('databaseDetail.copy')}</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <article className={statusTone}>
        <div className="toolbar">
          <div className="toolbar-group">
            <strong>{t('databaseDetail.statusHint')}</strong>
            <span>{statusMessage}</span>
          </div>
          <div className="toolbar-group">
            {resultApiUrl ? (
              <a className="secondary-button action-link" href={resultApiUrl} rel="noreferrer" target="_blank">
                {isChinese ? '结果 API' : 'Result API'}
              </a>
            ) : null}
            <label className="inline-toggle">
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
              <span>{t('jobs.autoRefresh')}</span>
            </label>
            <button className="secondary-button" disabled={refreshing} onClick={loadJob} type="button">
              {refreshing ? t('jobs.refreshing') : t('databaseDetail.refreshNow')}
            </button>
          </div>
        </div>
        <p className="toolbar-note">
          {isChinese
            ? `最近刷新时间：${lastLoadedAt || '尚未完成首次加载'}${autoRefresh ? '，运行中任务会每 3 秒自动刷新。' : '，当前为手动刷新模式。'}`
            : `Last refreshed: ${lastLoadedAt || 'not loaded yet'}${autoRefresh ? ', running jobs refresh every 3 seconds.' : ', manual refresh mode.'}`}
        </p>
      </article>

      <div className="two-column">
        <article className="panel">
          <h3>{t('databaseDetail.taskStatus')}</h3>
          {job ? (
            <div className="detail-grid">
              <span>{isChinese ? '状态' : 'Status'}：{job.status}</span>
              <span>{isChinese ? '数据库 ID' : 'Database ID'}：{job.database_id || '-'}</span>
              <span>{isChinese ? '标题' : 'Title'}：{job.title || '-'}</span>
              <span>{isChinese ? '提交时间' : 'Submitted At'}：{job.submitted_at}</span>
              <span>{isChinese ? '开始时间' : 'Started At'}：{job.started_at || '-'}</span>
              <span>{isChinese ? '完成时间' : 'Completed At'}：{job.completed_at || '-'}</span>
              <span>{isChinese ? '退出码' : 'Exit Code'}：{typeof job.exitstatus === 'number' ? job.exitstatus : '-'}</span>
              {stdoutApiUrl ? (
                <a className="secondary-button action-link" href={stdoutApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 stdout API' : 'Open stdout API'}
                </a>
              ) : null}
              {stderrApiUrl ? (
                <a className="secondary-button action-link" href={stderrApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 stderr API' : 'Open stderr API'}
                </a>
              ) : null}
              {(job.status === 'queued' || job.status === 'running') ? (
                <button className="primary-button" type="button" onClick={handleCancel}>
                  {t('databaseDetail.cancel')}
                </button>
              ) : null}
            </div>
          ) : (
            <p>{isChinese ? '加载中...' : 'Loading...'}</p>
          )}
        </article>

        <article className="panel">
          <h3>{t('databaseDetail.resultSummary')}</h3>
          {summary ? (
            <div className="result-stack">
              <div className="result-summary-grid">
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '索引状态' : 'Index Status'}</span>
                  <strong>{summary.indexed ? (isChinese ? '已完成' : 'Completed') : (isChinese ? '未完成' : 'Incomplete')}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '序列数' : 'Sequences'}</span>
                  <strong>{formatCount(summary.nsequences)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '字符数' : 'Characters'}</span>
                  <strong>{formatCount(summary.ncharacters)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '数据库类型' : 'Database Type'}</span>
                  <strong>{summary.type || '-'}</strong>
                </div>
              </div>

              <div className="detail-grid">
                <span>{isChinese ? '数据库 ID' : 'Database ID'}：{summary.id || job?.database_id || '-'}</span>
                <span>{isChinese ? '名称' : 'Name'}：{summary.name || '-'}</span>
                <span>{isChinese ? '标题' : 'Title'}：{summary.title || job?.title || '-'}</span>
                <span>{isChinese ? '更新时间' : 'Updated At'}：{summary.updatedOn || '-'}</span>
                <span>{isChinese ? '格式版本' : 'Format'}：{summary.format || '-'}</span>
                <span>{isChinese ? '分类' : 'Categories'}：{summary.categories.length ? summary.categories.join(isChinese ? '，' : ', ') : '-'}</span>
              </div>

              <CollapsibleSection
                defaultCollapsed={false}
                storageKey={`database:${id}:next-actions`}
                title={isChinese ? '后续操作' : 'Next Actions'}
              >
                <div className="list">
                  {nextActions.map((action) => (
                    <div className="list-item" key={action.to}>
                      <strong>
                        <Link to={action.to}>{action.label}</Link>
                      </strong>
                      <span>{action.helper}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                className="result-box"
                defaultCollapsed={true}
                storageKey={`database:${id}:raw-json`}
                title={isChinese ? '原始结果 JSON' : 'Raw Result JSON'}
              >
                <pre className="log-box">{JSON.stringify(result, null, 2)}</pre>
              </CollapsibleSection>
            </div>
          ) : (
            <div className="result-stack">
              <p>{isChinese ? '任务未完成或结果尚未加载。' : 'The job is not finished or the result has not been loaded yet.'}</p>
              {job?.result_url ? <code>{job.result_url}</code> : null}
              {(job?.status === 'failed' || job?.status === 'cancelled') && failureHints.length ? (
                <CollapsibleSection
                  defaultCollapsed={false}
                  storageKey={`database:${id}:failure-hints`}
                  title={isChinese ? '失败诊断建议' : 'Failure Hints'}
                >
                  <div className="list">
                    {failureHints.map((hint) => (
                      <div className="list-item list-item-warning" key={hint}>
                        <span>{hint}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              ) : null}
              <CollapsibleSection
                defaultCollapsed={false}
                storageKey={`database:${id}:pending-next-actions`}
                title={isChinese ? '后续操作' : 'Next Actions'}
              >
                <div className="list">
                  {nextActions.map((action) => (
                    <div className="list-item" key={action.to}>
                      <strong>
                        <Link to={action.to}>{action.label}</Link>
                      </strong>
                      <span>{action.helper}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          )}
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <CollapsibleSection
            className=""
            defaultCollapsed={true}
            storageKey={`database:${id}:stdout`}
            title={isChinese ? 'stdout 日志' : 'stdout Log'}
            actions={
              stdoutApiUrl ? (
                <a className="secondary-button action-link" href={stdoutApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 API' : 'Open API'}
                </a>
              ) : undefined
            }
          >
            <p className="toolbar-note">{isChinese ? '摘要' : 'Summary'}：{summarizeLog(stdoutLog, isChinese)}</p>
            <pre className="log-box">{stdoutLog?.content || (isChinese ? '暂无输出' : 'No output')}</pre>
          </CollapsibleSection>
        </article>
        <article className="panel">
          <CollapsibleSection
            className=""
            defaultCollapsed={true}
            storageKey={`database:${id}:stderr`}
            title={isChinese ? 'stderr 日志' : 'stderr Log'}
            actions={
              stderrApiUrl ? (
                <a className="secondary-button action-link" href={stderrApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 API' : 'Open API'}
                </a>
              ) : undefined
            }
          >
            <p className="toolbar-note">{isChinese ? '摘要' : 'Summary'}：{summarizeLog(stderrLog, isChinese)}</p>
            <pre className="log-box">{stderrLog?.content || (isChinese ? '暂无输出' : 'No output')}</pre>
          </CollapsibleSection>
        </article>
      </div>
    </section>
  )
}
